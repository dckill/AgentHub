import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { createBackoff, HttpStatusError } from '@/utils/time';
import { createAuthenticatedHttpClient, createPublicHttpClient } from './httpClient';

const credentials = { token: 'token', secret: 'secret' };

function response(status: number, body?: unknown): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        headers: new Headers(body === undefined ? {} : { 'content-type': 'application/json' }),
        json: async () => body,
        text: async () => body === undefined ? '' : JSON.stringify(body),
    } as Response;
}

describe('authenticated HTTP client', () => {
    beforeEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it('adds standard headers, serializes JSON and validates the response schema', async () => {
        const fetchImpl = vi.fn(async () => response(200, { value: 3 }));
        const client = createAuthenticatedHttpClient({
            getBaseUrl: () => 'https://server.test',
            getClientId: () => 'web/test',
            fetchImpl,
        });

        const result = await client.request(credentials, '/v1/test', {
            method: 'POST',
            body: { input: true },
            schema: z.object({ value: z.number() }),
        });

        expect(result.data).toEqual({ value: 3 });
        expect(fetchImpl).toHaveBeenCalledWith('https://server.test/v1/test', expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ input: true }),
            headers: expect.objectContaining({
                Authorization: 'Bearer token',
                'Content-Type': 'application/json',
                'X-AgentHub-Client': 'web/test',
            }),
            signal: expect.any(AbortSignal),
        }));
    });

    it('times out a pending request and preserves caller cancellation', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason));
        }));
        const client = createAuthenticatedHttpClient({ getBaseUrl: () => '', getClientId: () => '', fetchImpl });
        const request = client.request(credentials, '/slow', { method: 'POST', timeoutMs: 50 });
        const rejection = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });
        await vi.advanceTimersByTimeAsync(50);
        await rejection;
        vi.useRealTimers();
    });

    it('applies the timeout once to idempotent GET requests instead of retrying the full timeout', async () => {
        vi.useFakeTimers();
        const fetchImpl = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject((init.signal as AbortSignal).reason));
        }));
        const retry = createBackoff({ minDelay: 0, maxDelay: 0, maxAttempts: 6 });
        const client = createAuthenticatedHttpClient({ getBaseUrl: () => '', getClientId: () => '', fetchImpl, retry });
        const request = client.request(credentials, '/slow-read', { timeoutMs: 50 });
        const rejection = expect(request).rejects.toMatchObject({ name: 'TimeoutError' });

        await vi.advanceTimersByTimeAsync(50);
        await rejection;
        expect(fetchImpl).toHaveBeenCalledTimes(1);
        vi.useRealTimers();
    });

    it('does not retry 401 and retries an idempotent GET after transient 503', async () => {
        const retry = createBackoff({ minDelay: 0, maxDelay: 0, maxAttempts: 3 });
        const unauthorizedFetch = vi.fn(async () => response(401, { error: 'unauthorized' }));
        const unauthorized = createAuthenticatedHttpClient({ getBaseUrl: () => '', getClientId: () => '', fetchImpl: unauthorizedFetch, retry });
        await expect(unauthorized.request(credentials, '/private')).rejects.toBeInstanceOf(HttpStatusError);
        expect(unauthorizedFetch).toHaveBeenCalledOnce();

        const transientFetch = vi.fn()
            .mockResolvedValueOnce(response(503, { error: 'busy' }))
            .mockResolvedValueOnce(response(200, { ok: true }));
        const transient = createAuthenticatedHttpClient({ getBaseUrl: () => '', getClientId: () => '', fetchImpl: transientFetch, retry });
        await expect(transient.request(credentials, '/read')).resolves.toMatchObject({ data: { ok: true } });
        expect(transientFetch).toHaveBeenCalledTimes(2);
    });

    it('does not retry POST unless the caller explicitly marks it idempotent', async () => {
        const retry = createBackoff({ minDelay: 0, maxDelay: 0, maxAttempts: 3 });
        const fetchImpl = vi.fn(async () => response(503, { error: 'busy' }));
        const client = createAuthenticatedHttpClient({ getBaseUrl: () => '', getClientId: () => '', fetchImpl, retry });

        await expect(client.request(credentials, '/mutate', { method: 'POST', body: {} })).rejects.toMatchObject({ status: 503 });
        expect(fetchImpl).toHaveBeenCalledOnce();
    });

    it('returns explicitly accepted business statuses without converting them to transport errors', async () => {
        const client = createAuthenticatedHttpClient({
            getBaseUrl: () => '',
            getClientId: () => '',
            fetchImpl: vi.fn(async () => response(404, { missing: true })),
        });

        await expect(client.request(credentials, '/optional', { acceptedStatuses: [404] }))
            .resolves.toEqual({ status: 404, data: { missing: true } });
    });

    it('uses the same timeout/error core for public requests without attaching bearer credentials', async () => {
        const fetchImpl = vi.fn(async () => response(200, { ok: true }));
        const client = createPublicHttpClient({ getBaseUrl: () => '', getClientId: () => 'web/test', fetchImpl });

        await client.request('/v1/auth', { method: 'POST', body: { challenge: 'value' } });

        expect(fetchImpl).toHaveBeenCalledWith('/v1/auth', expect.objectContaining({
            headers: expect.not.objectContaining({ Authorization: expect.anything() }),
            signal: expect.any(AbortSignal),
        }));
    });
});
