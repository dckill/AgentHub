import { describe, expect, it, vi } from 'vitest';
import { archiveSessionOnServer } from './sessionArchiveFallback';

describe('archiveSessionOnServer', () => {
  it('posts an authenticated archive request with encoded session id', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await expect(archiveSessionOnServer({
      serverUrl: 'https://server.test',
      sessionId: 'session/one',
      token: 'token-1',
      request,
    })).resolves.toEqual({ ok: true });
    expect(request).toHaveBeenCalledWith(
      'https://server.test/v1/sessions/session%2Fone/archive',
      { method: 'POST', headers: { Authorization: 'Bearer token-1' } },
    );
  });

  it('carries encrypted archived metadata with an expected version for atomic fallback', async () => {
    const request = vi.fn().mockResolvedValue({ ok: true, status: 200 });

    await expect(archiveSessionOnServer({
      serverUrl: 'https://server.test',
      sessionId: 'session-1',
      token: 'token-1',
      metadata: 'encrypted-archived-metadata',
      expectedMetadataVersion: 7,
      request,
    })).resolves.toEqual({ ok: true });

    expect(request).toHaveBeenCalledWith(
      'https://server.test/v1/sessions/session-1/archive',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-1',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          metadata: 'encrypted-archived-metadata',
          expectedMetadataVersion: 7,
        }),
      },
    );
  });

  it('reports HTTP failures without claiming archive success', async () => {
    const request = vi.fn().mockResolvedValue({ ok: false, status: 503 });

    await expect(archiveSessionOnServer({
      serverUrl: 'https://server.test',
      sessionId: 'session-1',
      token: 'token-1',
      request,
    })).resolves.toEqual({ ok: false, reason: 'http', status: 503 });
  });

  it('reports network failures without throwing from process-exit cleanup', async () => {
    const request = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(archiveSessionOnServer({
      serverUrl: 'https://server.test',
      sessionId: 'session-1',
      token: 'token-1',
      request,
    })).resolves.toEqual({ ok: false, reason: 'network' });
  });
});
