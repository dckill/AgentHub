import { afterEach, describe, expect, it, vi } from 'vitest';
import { startDaemonControlServer } from './controlServer';

const servers: Array<{ stop: () => Promise<void> }> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => server.stop()));
});

async function start(getChildren: () => unknown[] = () => []) {
  const spawnSession = vi.fn(async () => ({ type: 'success' as const, sessionId: 'new-session' }));
  const server = await (startDaemonControlServer as any)({
    controlToken: 'test-control-token-with-at-least-32-characters',
    ownerNonce: 'test-owner-nonce',
    getChildren,
    stopSession: vi.fn(() => ({ success: true, state: 'stopping' as const })),
    spawnSession,
    requestShutdown: vi.fn(),
    onAgentHubSessionWebhook: vi.fn(),
  });
  servers.push(server);
  return { ...server, spawnSession };
}

async function post(port: number, path: string, body: unknown = {}, token?: string) {
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe('daemon HTTP control boundary', () => {
  it('rejects missing and incorrect bearer tokens on every endpoint', async () => {
    const { port } = await start();
    const requests: Array<[string, unknown]> = [
      ['/session-started', { sessionId: 's1', metadata: {} }],
      ['/list', {}],
      ['/stop-session', { sessionId: 's1' }],
      ['/spawn-session', { directory: '/tmp' }],
      ['/stop', {}],
    ];

    for (const [path, body] of requests) {
      expect((await post(port, path, body)).status, `${path} without token`).toBe(401);
      expect((await post(port, path, body, 'wrong-token')).status, `${path} with wrong token`).toBe(401);
    }
  });

  it('rejects non-allowlisted environment variables even with a valid token', async () => {
    const { port, spawnSession } = await start();
    const response = await post(port, '/spawn-session', {
      directory: '/tmp',
      environmentVariables: { AWS_SECRET_ACCESS_KEY: 'must-not-cross-control-boundary' },
    }, 'test-control-token-with-at-least-32-characters');

    expect(response.status).toBe(400);
    expect(spawnSession).not.toHaveBeenCalled();
  });

  it('binds authenticated responses to the daemon owner nonce', async () => {
    const { port } = await start();
    const response = await post(port, '/list', {}, 'test-control-token-with-at-least-32-characters');

    expect(response.status).toBe(200);
    expect(response.headers.get('x-agenthub-owner-nonce')).toBe('test-owner-nonce');
  });

  it('returns an observable stopping state for an authenticated stop request', async () => {
    const { port } = await start();
    const response = await post(port, '/stop-session', { sessionId: 's1' }, 'test-control-token-with-at-least-32-characters');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true, state: 'stopping' });
  });

  it('preserves lifecycle state in the authenticated session list response', async () => {
    const { port } = await start(() => [{
      startedBy: 'daemon',
      agentHubSessionId: 'session-stopping',
      pid: 1234,
      lifecycleState: 'stopping',
    }]);

    const response = await post(port, '/list', {}, 'test-control-token-with-at-least-32-characters');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      children: [{
        startedBy: 'daemon',
        agentHubSessionId: 'session-stopping',
        pid: 1234,
        lifecycleState: 'stopping',
      }],
    });
  });
});
