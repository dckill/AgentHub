import fastify from 'fastify';
import { describe, expect, it } from 'vitest';

describe('HTTP resource limits', () => {
    it('returns 429 with Retry-After after the per-source request budget', async () => {
        const module = await import('./enableResourceLimits').catch(() => ({} as any));
        expect(module.enableResourceLimits).toBeTypeOf('function');
        const app = fastify();
        module.enableResourceLimits(app, { readLimit: 2, mutationLimit: 2, windowMs: 1_000, mutationConcurrency: 2 });
        app.get('/read', async () => ({ ok: true }));
        await app.ready();

        expect((await app.inject({ method: 'GET', url: '/read' })).statusCode).toBe(200);
        expect((await app.inject({ method: 'GET', url: '/read' })).statusCode).toBe(200);
        const limited = await app.inject({ method: 'GET', url: '/read' });
        expect(limited.statusCode).toBe(429);
        expect(limited.headers['retry-after']).toBe('1');
        expect(limited.json()).toEqual({ error: 'rate-limit', retryAfterMs: expect.any(Number) });
        await app.close();
    });

    it('rejects excess concurrent mutations and releases capacity after completion', async () => {
        const module = await import('./enableResourceLimits').catch(() => ({} as any));
        expect(module.enableResourceLimits).toBeTypeOf('function');
        const app = fastify();
        module.enableResourceLimits(app, { readLimit: 100, mutationLimit: 100, windowMs: 1_000, mutationConcurrency: 1 });
        let enter!: () => void;
        const entered = new Promise<void>((resolve) => { enter = resolve; });
        let release!: () => void;
        const gate = new Promise<void>((resolve) => { release = resolve; });
        app.post('/write', async () => {
            enter();
            await gate;
            return { ok: true };
        });
        await app.ready();

        const first = app.inject({ method: 'POST', url: '/write' });
        await entered;
        const rejected = await app.inject({ method: 'POST', url: '/write' });
        expect(rejected.statusCode).toBe(429);
        expect(rejected.json()).toEqual({ error: 'too-many-in-flight-requests' });
        release();
        expect((await first).statusCode).toBe(200);
        expect((await app.inject({ method: 'POST', url: '/write' })).statusCode).toBe(200);
        await app.close();
    });
});
