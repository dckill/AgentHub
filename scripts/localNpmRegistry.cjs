const crypto = require('node:crypto');
const http = require('node:http');

const DEFAULT_MAX_PUBLISH_BYTES = 170 * 1024 * 1024;

function json(response, status, value) {
  const body = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, {
    'content-length': body.length,
    'content-type': 'application/json; charset=utf-8',
  });
  response.end(body);
}

function hasToken(request, expected) {
  const authorization = request.headers.authorization || '';
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
  const expectedBytes = Buffer.from(expected);
  const suppliedBytes = Buffer.from(supplied);
  return suppliedBytes.length === expectedBytes.length
    && crypto.timingSafeEqual(suppliedBytes, expectedBytes);
}

function readBody(request, response, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        json(response, 413, { error: 'publish payload exceeds local registry limit' });
        request.destroy();
        reject(Object.assign(new Error('payload too large'), { handled: true }));
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function decodePathname(url) {
  try {
    return decodeURIComponent(new URL(url, 'http://127.0.0.1').pathname);
  } catch {
    return null;
  }
}

function packageNameFromPath(pathname) {
  if (!pathname || pathname === '/' || pathname.startsWith('/-/')) return null;
  const withoutSlash = pathname.slice(1);
  if (withoutSlash.startsWith('@')) {
    const segments = withoutSlash.split('/');
    return segments.length === 2 ? withoutSlash : null;
  }
  return withoutSlash.includes('/') ? null : withoutSlash;
}

function tagRoute(pathname) {
  const prefix = '/-/package/';
  if (!pathname?.startsWith(prefix)) return null;
  const remainder = pathname.slice(prefix.length);
  const marker = '/dist-tags';
  const markerIndex = remainder.indexOf(marker);
  if (markerIndex <= 0) return null;
  const name = remainder.slice(0, markerIndex);
  const suffix = remainder.slice(markerIndex + marker.length);
  if (!name || (suffix && !suffix.startsWith('/'))) return null;
  return { name, tag: suffix ? suffix.slice(1) : null };
}

function normalizedAttachmentName(packageName, value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 512 || value.includes('\\')) return null;
  const prefix = `${packageName}/-/`;
  const [scope, unscopedName] = packageName.startsWith('@') ? packageName.split('/') : [null, packageName];
  let basename = value.startsWith(prefix) ? value.slice(prefix.length) : value;
  if (scope && basename.startsWith(`${scope}/`)) basename = basename.slice(scope.length + 1);
  return basename.length > 0
    && basename.length <= 255
    && !basename.includes('/')
    && basename.startsWith(`${unscopedName}-`)
    && basename.endsWith('.tgz')
    && basename !== '.'
    && basename !== '..'
    ? basename
    : null;
}

function rewriteUpstreamTarballs(value, upstreamRegistry, proxyRegistry) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  if (!value.versions || typeof value.versions !== 'object' || Array.isArray(value.versions)) return value;
  const upstream = new URL(upstreamRegistry);
  for (const version of Object.values(value.versions)) {
    if (!version?.dist || typeof version.dist.tarball !== 'string') continue;
    let tarball;
    try {
      tarball = new URL(version.dist.tarball);
    } catch {
      continue;
    }
    if (tarball.origin !== upstream.origin) continue;
    version.dist.tarball = new URL(`${tarball.pathname}${tarball.search}`, proxyRegistry).toString();
  }
  return value;
}

async function startLocalNpmRegistry(options) {
  if (!options || typeof options.token !== 'string' || options.token.length < 32) {
    throw new Error('local registry requires an authentication token of at least 32 characters');
  }
  const token = options.token;
  const upstreamRegistry = options.upstreamRegistry === undefined
    ? 'https://registry.npmjs.org'
    : options.upstreamRegistry;
  const maxPublishBytes = options.maxPublishBytes || DEFAULT_MAX_PUBLISH_BYTES;
  const packages = new Map();
  const tarballs = new Map();
  let publishCount = 0;
  let tagMutationCount = 0;
  let baseUrl = '';

  const server = http.createServer(async (request, response) => {
    const pathname = decodePathname(request.url);
    if (!pathname) {
      json(response, 400, { error: 'invalid request path' });
      return;
    }

    try {
      if (request.method === 'GET' && pathname === '/-/ping') {
        json(response, 200, {});
        return;
      }
      if (request.method === 'GET' && pathname === '/-/whoami') {
        if (!hasToken(request, token)) {
          json(response, 401, { error: 'authentication required' });
          return;
        }
        json(response, 200, { username: 'agenthub-release-drill' });
        return;
      }

      const tags = tagRoute(pathname);
      if (tags) {
        const stored = packages.get(tags.name);
        if (!stored) {
          json(response, 404, { error: 'package not found' });
          return;
        }
        if (request.method === 'GET' && tags.tag === null) {
          json(response, 200, stored.tags);
          return;
        }
        if (request.method === 'PUT' && tags.tag) {
          if (!hasToken(request, token)) {
            json(response, 401, { error: 'authentication required' });
            return;
          }
          const body = await readBody(request, response, 4096);
          let version;
          try {
            version = JSON.parse(body.toString('utf8'));
          } catch {
            json(response, 400, { error: 'invalid tag payload' });
            return;
          }
          if (typeof version !== 'string' || !stored.versions[version]) {
            json(response, 400, { error: 'tag must reference a published version' });
            return;
          }
          stored.tags[tags.tag] = version;
          tagMutationCount += 1;
          json(response, 201, { ok: true });
          return;
        }
      }

      if (request.method === 'GET' && tarballs.has(pathname)) {
        const archive = tarballs.get(pathname);
        response.writeHead(200, {
          'content-length': archive.length,
          'content-type': 'application/octet-stream',
        });
        response.end(archive);
        return;
      }

      const name = packageNameFromPath(pathname);
      if (name && request.method === 'GET' && packages.has(name)) {
        const stored = packages.get(name);
        json(response, 200, {
          _id: name,
          name,
          'dist-tags': stored.tags,
          versions: stored.versions,
        });
        return;
      }

      if (name && request.method === 'PUT') {
        if (!hasToken(request, token)) {
          json(response, 401, { error: 'authentication required' });
          return;
        }
        const body = await readBody(request, response, maxPublishBytes);
        let document;
        try {
          document = JSON.parse(body.toString('utf8'));
        } catch {
          json(response, 400, { error: 'invalid publish document' });
          return;
        }
        if (document?.name !== name || document?._id !== name) {
          json(response, 400, { error: 'package identity does not match request path' });
          return;
        }
        const versions = Object.entries(document.versions || {});
        const attachments = Object.entries(document._attachments || {});
        if (versions.length !== 1 || attachments.length !== 1) {
          json(response, 400, { error: 'release drill accepts exactly one version and one attachment per publish' });
          return;
        }
        const [version, versionMetadata] = versions[0];
        const [attachmentName, attachmentMetadata] = attachments[0];
        const archiveName = normalizedAttachmentName(name, attachmentName);
        if (versionMetadata?.name !== name || versionMetadata?.version !== version || !archiveName) {
          json(response, 400, {
            error: 'invalid version or attachment metadata',
          });
          return;
        }
        let archive;
        try {
          archive = Buffer.from(attachmentMetadata.data, 'base64');
        } catch {
          json(response, 400, { error: 'invalid attachment encoding' });
          return;
        }
        if (!archive.length || archive.length !== attachmentMetadata.length) {
          json(response, 400, { error: 'attachment length mismatch' });
          return;
        }
        const expectedShasum = crypto.createHash('sha1').update(archive).digest('hex');
        const expectedIntegrity = `sha512-${crypto.createHash('sha512').update(archive).digest('base64')}`;
        if (versionMetadata.dist?.shasum !== expectedShasum
            || versionMetadata.dist?.integrity !== expectedIntegrity) {
          json(response, 400, { error: 'attachment digest mismatch' });
          return;
        }
        const previous = packages.get(name);
        const stored = {
          versions: { ...(previous?.versions || {}) },
          tags: { ...(previous?.tags || {}) },
        };
        if (stored.versions[version]) {
          json(response, 409, { error: 'version already exists' });
          return;
        }
        const tarballPath = `/${name}/-/${archiveName}`;
        const nextTags = { ...stored.tags };
        for (const [tag, tagVersion] of Object.entries(document['dist-tags'] || {})) {
          if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(tag) || tagVersion !== version) {
            json(response, 400, { error: 'publish tag must reference the uploaded version' });
            return;
          }
          nextTags[tag] = tagVersion;
        }
        stored.versions[version] = {
          ...versionMetadata,
          dist: { ...versionMetadata.dist, tarball: `${baseUrl}${encodeURIComponent(name)}/-/${encodeURIComponent(archiveName)}` },
        };
        stored.tags = nextTags;
        packages.set(name, stored);
        tarballs.set(tarballPath, archive);
        publishCount += 1;
        json(response, 201, { ok: true, id: name, rev: `${publishCount}` });
        return;
      }

      if (request.method === 'GET' && upstreamRegistry) {
        const incoming = new URL(request.url, 'http://127.0.0.1');
        const upstream = new URL(upstreamRegistry);
        upstream.pathname = incoming.pathname;
        upstream.search = incoming.search;
        const upstreamResponse = await fetch(upstream, {
          headers: { accept: request.headers.accept || 'application/json' },
          redirect: 'follow',
        });
        let bytes = Buffer.from(await upstreamResponse.arrayBuffer());
        const contentType = upstreamResponse.headers.get('content-type') || 'application/octet-stream';
        if (upstreamResponse.ok && /(?:application\/json|\+json)(?:;|$)/i.test(contentType)) {
          try {
            const metadata = JSON.parse(bytes.toString('utf8'));
            rewriteUpstreamTarballs(metadata, upstreamRegistry, baseUrl);
            bytes = Buffer.from(JSON.stringify(metadata));
          } catch {
            // Preserve non-package JSON payloads byte-for-byte when they cannot be parsed.
          }
        }
        response.writeHead(upstreamResponse.status, {
          'content-length': bytes.length,
          'content-type': contentType,
        });
        response.end(bytes);
        return;
      }

      json(response, 404, { error: 'not found' });
    } catch (error) {
      if (!error?.handled && !response.headersSent) json(response, 500, { error: 'local registry request failed' });
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}/`;

  return {
    url: baseUrl,
    close: () => new Promise((resolve, reject) => {
      server.close((error) => {
        if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
        else resolve();
      });
      server.closeIdleConnections?.();
      server.closeAllConnections?.();
    }),
    snapshot: () => ({
      packages: Object.fromEntries([...packages.entries()].sort().map(([name, stored]) => [name, {
        versions: Object.keys(stored.versions).sort(),
        tags: { ...stored.tags },
      }])),
      publishCount,
      tagMutationCount,
    }),
  };
}

module.exports = { startLocalNpmRegistry };
