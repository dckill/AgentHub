import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { startNativeQaDelayedResponseProxy } from './nativeQaDelayedResponseProxy.mjs';

async function listen(server) {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    const address = server.address();
    assert(address && typeof address === 'object');
    return `http://127.0.0.1:${address.port}`;
}

test('forwards requests normally until a response delay is explicitly armed', async (t) => {
    const upstream = createServer((request, response) => {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ path: request.url }));
    });
    const upstreamOrigin = await listen(upstream);
    t.after(() => upstream.close());

    const proxy = await startNativeQaDelayedResponseProxy({ targetOrigin: upstreamOrigin });
    t.after(() => proxy.close());

    const response = await fetch(`${proxy.origin}/v1/profile`);
    assert.deepEqual(await response.json(), { path: '/v1/profile' });
    assert.deepEqual(proxy.events, []);
});

test('holds one matching response until release and records the device-visible delay', async (t) => {
    const upstream = createServer((_request, response) => response.end('sessions-a'));
    const upstreamOrigin = await listen(upstream);
    t.after(() => upstream.close());

    const proxy = await startNativeQaDelayedResponseProxy({ targetOrigin: upstreamOrigin });
    t.after(() => proxy.close());
    proxy.arm({ pathname: '/v1/sessions', matches: 1 });

    let settled = false;
    const pending = fetch(`${proxy.origin}/v1/sessions`).then(async (response) => {
        settled = true;
        return response.text();
    });
    const held = await proxy.waitForHeldResponse(1_000);

    assert.equal(held.pathname, '/v1/sessions');
    assert.equal(settled, false);
    assert.equal(proxy.releaseHeldResponses(), 1);
    assert.equal(await pending, 'sessions-a');
    assert.equal(proxy.events[0]?.outcome, 'released');
});

test('records when logout aborts the delayed account request before release', async (t) => {
    const upstream = createServer((_request, response) => response.end('sessions-a'));
    const upstreamOrigin = await listen(upstream);
    t.after(() => upstream.close());

    const proxy = await startNativeQaDelayedResponseProxy({ targetOrigin: upstreamOrigin });
    t.after(() => proxy.close());
    proxy.arm({ pathname: '/v1/sessions', matches: 1 });

    const controller = new AbortController();
    const pending = fetch(`${proxy.origin}/v1/sessions`, { signal: controller.signal });
    await proxy.waitForHeldResponse(1_000);
    controller.abort();
    await assert.rejects(pending, (error) => error?.name === 'AbortError');
    await proxy.waitForOutcome('downstream-aborted', 1_000);

    assert.equal(proxy.events[0]?.outcome, 'downstream-aborted');
});
