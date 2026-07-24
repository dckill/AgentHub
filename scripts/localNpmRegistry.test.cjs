const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const http = require('node:http');
const net = require('node:net');
const test = require('node:test');

const { startLocalNpmRegistry } = require('./localNpmRegistry.cjs');

function startCountingServer(label) {
  let requests = 0;
  const server = http.createServer((_request, response) => {
    requests += 1;
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end(label);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}/`,
        requests: () => requests,
        close: () => new Promise((done, fail) => server.close((error) => error ? fail(error) : done())),
      });
    });
  });
}

function attachment(name, version, contents) {
  const bytes = Buffer.from(contents);
  return {
    name: `${name.split('/').pop()}-${version}.tgz`,
    bytes,
    metadata: {
      content_type: 'application/octet-stream',
      data: bytes.toString('base64'),
      length: bytes.length,
    },
  };
}

function publishDocument(name, version, tag, contents) {
  const archive = attachment(name, version, contents);
  return {
    archive,
    document: {
      _id: name,
      name,
      'dist-tags': { [tag]: version },
      versions: {
        [version]: {
          name,
          version,
          dist: {
            integrity: `sha512-${crypto.createHash('sha512').update(archive.bytes).digest('base64')}`,
            shasum: crypto.createHash('sha1').update(archive.bytes).digest('hex'),
          },
        },
      },
      _attachments: { [archive.name]: archive.metadata },
    },
  };
}

test('isolated registry requires auth, merges versions, serves tarballs and rolls back a dist-tag', async (t) => {
  const token = crypto.randomBytes(32).toString('hex');
  const registry = await startLocalNpmRegistry({ token, upstreamRegistry: null });
  t.after(() => registry.close());

  const name = '@artsum/agenthub';
  const encodedName = encodeURIComponent(name);
  const baseline = publishDocument(name, '1.0.2-drill.0', 'latest', 'baseline archive');
  const candidate = publishDocument(name, '1.0.3', 'latest', 'candidate archive');
  candidate.document._attachments = {
    [`${name.split('/')[0]}/${candidate.archive.name}`]: candidate.archive.metadata,
  };

  const unauthorized = await fetch(`${registry.url}${encodedName}`, {
    method: 'PUT',
    body: JSON.stringify(baseline.document),
    headers: { 'content-type': 'application/json' },
  });
  assert.equal(unauthorized.status, 401);

  for (const release of [baseline, candidate]) {
    const response = await fetch(`${registry.url}${encodedName}`, {
      method: 'PUT',
      body: JSON.stringify(release.document),
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
    });
    assert.equal(response.status, 201, await response.text());
  }

  const metadataResponse = await fetch(`${registry.url}${encodedName}`);
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.equal(metadata['dist-tags'].latest, '1.0.3');
  assert.deepEqual(Object.keys(metadata.versions).sort(), ['1.0.2-drill.0', '1.0.3']);
  assert.match(metadata.versions['1.0.3'].dist.tarball, /^http:\/\/127\.0\.0\.1:\d+\//);

  const tarballResponse = await fetch(metadata.versions['1.0.3'].dist.tarball);
  assert.equal(tarballResponse.status, 200);
  assert.deepEqual(Buffer.from(await tarballResponse.arrayBuffer()), candidate.archive.bytes);

  const rollback = await fetch(`${registry.url}-/package/${encodedName}/dist-tags/latest`, {
    method: 'PUT',
    body: JSON.stringify('1.0.2-drill.0'),
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
  });
  assert.equal(rollback.status, 201, await rollback.text());

  const tags = await fetch(`${registry.url}-/package/${encodedName}/dist-tags`).then((response) => response.json());
  assert.deepEqual(tags, { latest: '1.0.2-drill.0' });
  assert.deepEqual(registry.snapshot(), {
    packages: { [name]: { versions: ['1.0.2-drill.0', '1.0.3'], tags: { latest: '1.0.2-drill.0' } } },
    publishCount: 2,
    tagMutationCount: 1,
  });
});

test('isolated registry rejects duplicate versions, invalid tags and oversized payloads', async (t) => {
  const token = crypto.randomBytes(32).toString('hex');
  const registry = await startLocalNpmRegistry({ token, upstreamRegistry: null, maxPublishBytes: 1024 });
  t.after(() => registry.close());

  const name = '@artsum/agenthub';
  const encodedName = encodeURIComponent(name);
  const release = publishDocument(name, '1.0.3', 'latest', 'candidate archive');
  const headers = { authorization: `Bearer ${token}`, 'content-type': 'application/json' };
  const first = await fetch(`${registry.url}${encodedName}`, { method: 'PUT', body: JSON.stringify(release.document), headers });
  assert.equal(first.status, 201);
  const duplicate = await fetch(`${registry.url}${encodedName}`, { method: 'PUT', body: JSON.stringify(release.document), headers });
  assert.equal(duplicate.status, 409);

  const invalidTag = await fetch(`${registry.url}-/package/${encodedName}/dist-tags/latest`, {
    method: 'PUT', body: JSON.stringify('9.9.9'), headers,
  });
  assert.equal(invalidTag.status, 400);

  const invalidPublishTag = publishDocument(name, '1.0.4', 'latest', 'invalid tag archive');
  invalidPublishTag.document['dist-tags'].latest = '9.9.9';
  const rejectedPublish = await fetch(`${registry.url}${encodedName}`, {
    method: 'PUT', body: JSON.stringify(invalidPublishTag.document), headers,
  });
  assert.equal(rejectedPublish.status, 400);

  const invalidDigest = publishDocument(name, '1.0.5', 'latest', 'invalid digest archive');
  invalidDigest.document.versions['1.0.5'].dist.shasum = '0'.repeat(40);
  const rejectedDigest = await fetch(`${registry.url}${encodedName}`, {
    method: 'PUT', body: JSON.stringify(invalidDigest.document), headers,
  });
  assert.equal(rejectedDigest.status, 400);

  const metadata = await fetch(`${registry.url}${encodedName}`).then((response) => response.json());
  assert.deepEqual(Object.keys(metadata.versions), ['1.0.3']);

  const oversized = await fetch(`${registry.url}${encodedName}`, {
    method: 'PUT', body: 'x'.repeat(2048), headers,
  });
  assert.equal(oversized.status, 413);
});

test('upstream proxy pins the configured origin even when the request path starts with two slashes', async (t) => {
  const upstream = await startCountingServer('configured upstream');
  const attacker = await startCountingServer('wrong origin');
  const registry = await startLocalNpmRegistry({
    token: crypto.randomBytes(32).toString('hex'),
    upstreamRegistry: upstream.url,
  });
  t.after(async () => {
    await registry.close();
    await upstream.close();
    await attacker.close();
  });

  const attackerAuthority = new URL(attacker.url).host;
  const response = await fetch(`${registry.url}/${attackerAuthority}/escaped`);
  assert.equal(await response.text(), 'configured upstream');
  assert.equal(upstream.requests(), 1);
  assert.equal(attacker.requests(), 0);
});

test('upstream package metadata rewrites tarballs through the isolated registry proxy', async (t) => {
  const archive = Buffer.from('proxied dependency archive');
  let upstreamUrl = '';
  const upstreamRequests = [];
  const upstream = http.createServer((request, response) => {
    upstreamRequests.push({
      authorization: request.headers.authorization || null,
      url: request.url,
    });
    if (request.url === '/dependency') {
      const body = Buffer.from(JSON.stringify({
        name: 'dependency',
        'dist-tags': { latest: '1.0.0' },
        versions: {
          '1.0.0': {
            name: 'dependency',
            version: '1.0.0',
            dist: { tarball: `${upstreamUrl}dependency/-/dependency-1.0.0.tgz` },
          },
        },
      }));
      response.writeHead(200, {
        'content-length': body.length,
        'content-type': 'application/json',
      });
      response.end(body);
      return;
    }
    if (request.url === '/dependency/-/dependency-1.0.0.tgz') {
      response.writeHead(200, {
        'content-length': archive.length,
        'content-type': 'application/octet-stream',
      });
      response.end(archive);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise((resolve, reject) => {
    upstream.once('error', reject);
    upstream.listen(0, '127.0.0.1', resolve);
  });
  const upstreamAddress = upstream.address();
  upstreamUrl = `http://127.0.0.1:${upstreamAddress.port}/`;
  const registry = await startLocalNpmRegistry({
    token: crypto.randomBytes(32).toString('hex'),
    upstreamRegistry: upstreamUrl,
  });
  t.after(async () => {
    await registry.close();
    await new Promise((resolve, reject) => upstream.close((error) => error ? reject(error) : resolve()));
  });

  const metadataResponse = await fetch(`${registry.url}dependency`, {
    headers: { authorization: 'Bearer must-not-leak-upstream' },
  });
  assert.equal(metadataResponse.status, 200);
  const metadata = await metadataResponse.json();
  assert.equal(metadata.versions['1.0.0'].dist.tarball, `${registry.url}dependency/-/dependency-1.0.0.tgz`);

  const tarballResponse = await fetch(metadata.versions['1.0.0'].dist.tarball);
  assert.equal(tarballResponse.status, 200);
  assert.deepEqual(Buffer.from(await tarballResponse.arrayBuffer()), archive);
  assert.deepEqual(upstreamRequests, [
    { authorization: null, url: '/dependency' },
    { authorization: null, url: '/dependency/-/dependency-1.0.0.tgz' },
  ]);
});

test('registry close terminates an incomplete keep-alive connection instead of hanging CI', async () => {
  const registry = await startLocalNpmRegistry({
    token: crypto.randomBytes(32).toString('hex'),
    upstreamRegistry: null,
  });
  const target = new URL(registry.url);
  const socket = net.connect(Number(target.port), target.hostname);
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write('GET /unfinished HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: keep-alive\r\n');

  let closed = false;
  const closing = registry.close().then(() => { closed = true; });
  await new Promise((resolve) => setTimeout(resolve, 100));
  const closedWithinBound = closed;
  socket.destroy();
  await closing;
  assert.equal(closedWithinBound, true, 'registry close must force local drill connections closed');
});
