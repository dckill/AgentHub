import { describe, expect, it } from 'vitest';
import fastify from 'fastify';

describe('server resource limits', () => {
    it('uses transport budgets compatible with 4 MiB encrypted file chunks', async () => {
        const policy = await import('./resourceLimits').catch(() => ({} as any));

        expect(policy.HTTP_BODY_LIMIT_BYTES).toBe(8 * 1024 * 1024);
        expect(policy.SOCKET_MESSAGE_LIMIT_BYTES).toBe(8 * 1024 * 1024);
    });

    it('returns 413 before a handler receives an 8 MiB oversized HTTP body', async () => {
        const policy = await import('./resourceLimits');
        const app = fastify({ bodyLimit: policy.HTTP_BODY_LIMIT_BYTES });
        let handled = false;
        app.post('/payload', async () => { handled = true; return { ok: true }; });

        const response = await app.inject({
            method: 'POST',
            url: '/payload',
            payload: { data: 'x'.repeat(policy.HTTP_BODY_LIMIT_BYTES + 1) },
        });

        expect(response.statusCode).toBe(413);
        expect(handled).toBe(false);
        await app.close();
    });

    it('enforces a bounded fixed-window rate limit and resets after the window', async () => {
        const policy = await import('./resourceLimits').catch(() => ({} as any));
        expect(policy.FixedWindowRateLimiter).toBeTypeOf('function');
        let now = 1_000;
        const limiter = new policy.FixedWindowRateLimiter({ limit: 2, windowMs: 1_000, maxSubjects: 2, now: () => now });

        expect(limiter.consume('user-a').allowed).toBe(true);
        expect(limiter.consume('user-a').allowed).toBe(true);
        expect(limiter.consume('user-a')).toEqual({ allowed: false, retryAfterMs: 1_000 });
        limiter.consume('user-b');
        limiter.consume('user-c');
        expect(limiter.size).toBeLessThanOrEqual(2);

        now = 2_001;
        expect(limiter.consume('user-a').allowed).toBe(true);
    });

    it('caps concurrent work per subject and releases empty state', async () => {
        const policy = await import('./resourceLimits').catch(() => ({} as any));
        expect(policy.ConcurrencyLimiter).toBeTypeOf('function');
        const limiter = new policy.ConcurrencyLimiter(2);

        const releaseA = limiter.acquire('user-a');
        const releaseB = limiter.acquire('user-a');
        expect(releaseA).toBeTypeOf('function');
        expect(releaseB).toBeTypeOf('function');
        expect(limiter.acquire('user-a')).toBeNull();
        releaseA();
        expect(limiter.acquire('user-a')).toBeTypeOf('function');
        releaseB();
        limiter.reset('user-a');
        expect(limiter.size).toBe(0);
    });
});
