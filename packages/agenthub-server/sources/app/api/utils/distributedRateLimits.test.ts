import { describe, expect, it, vi } from 'vitest';

type Window = { count: number; expiresAt: number };

function fakeRedis(now: () => number) {
    const windows = new Map<string, Window>();
    const keys: string[] = [];
    return {
        keys,
        async eval(_script: string, _numberOfKeys: number, key: string, windowMs: string) {
            keys.push(key);
            const time = now();
            let window = windows.get(key);
            if (!window || window.expiresAt <= time) {
                window = { count: 0, expiresAt: time + Number(windowMs) };
                windows.set(key, window);
            }
            window.count += 1;
            return [window.count, window.expiresAt - time];
        },
    };
}

describe('DistributedFixedWindowRateLimiter', () => {
    it('shares one fixed-window allowance across independent server instances', async () => {
        const policy = await import('./distributedRateLimits').catch(() => ({} as typeof import('./distributedRateLimits')));
        expect(policy.DistributedFixedWindowRateLimiter).toBeTypeOf('function');
        let now = 1_000;
        const redis = fakeRedis(() => now);
        const create = () => new policy.DistributedFixedWindowRateLimiter({
            scope: 'http-read',
            limit: 2,
            windowMs: 60_000,
            maxFallbackSubjects: 10,
            redis,
            now: () => now,
        });
        const serverA = create();
        const serverB = create();

        await expect(serverA.consume('203.0.113.10')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
        await expect(serverB.consume('203.0.113.10')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
        await expect(serverA.consume('203.0.113.10')).resolves.toEqual({ allowed: false, retryAfterMs: 60_000 });

        expect(redis.keys).toHaveLength(3);
        expect(redis.keys[0]).not.toContain('203.0.113.10');
        expect(redis.keys[0]).toBe(redis.keys[1]);
        now += 60_000;
        await expect(serverB.consume('203.0.113.10')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    });

    it('falls back to a bounded local limiter when Redis is unavailable', async () => {
        const { DistributedFixedWindowRateLimiter } = await import('./distributedRateLimits');
        const onRedisError = vi.fn();
        const limiter = new DistributedFixedWindowRateLimiter({
            scope: 'socket-control',
            limit: 1,
            windowMs: 1_000,
            maxFallbackSubjects: 2,
            redis: { eval: vi.fn().mockRejectedValue(new Error('unavailable')) },
            onRedisError,
        });

        await expect(limiter.consume('socket-a')).resolves.toEqual({ allowed: true, retryAfterMs: 0 });
        await expect(limiter.consume('socket-a')).resolves.toMatchObject({ allowed: false });
        expect(onRedisError).toHaveBeenCalledTimes(2);
        expect(limiter.fallbackSize).toBeLessThanOrEqual(2);
    });
});
