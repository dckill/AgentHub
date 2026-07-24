import { Redis } from 'ioredis';
import { log } from '@/utils/log';
import { onShutdown } from '@/utils/shutdown';
import type { RedisRateLimitClient } from './distributedRateLimits';

let client: Redis | undefined;
let shutdownRegistered = false;
let lastErrorLogAt = 0;

export function getRateLimitRedisClient(): RedisRateLimitClient | undefined {
    if (!process.env.REDIS_URL) return undefined;
    if (!client) {
        client = new Redis(process.env.REDIS_URL, {
            lazyConnect: true,
            enableOfflineQueue: false,
            maxRetriesPerRequest: 1,
        });
        client.on('error', reportRateLimitRedisError);
    }
    if (!shutdownRegistered) {
        shutdownRegistered = true;
        onShutdown('rate-limit-redis', async () => {
            const current = client;
            client = undefined;
            shutdownRegistered = false;
            if (!current) return;
            if (current.status === 'ready') await current.quit().catch(() => current.disconnect());
            else current.disconnect();
        });
    }
    return client;
}

export function reportRateLimitRedisError(error: unknown): void {
    const now = Date.now();
    if (now - lastErrorLogAt < 30_000) return;
    lastErrorLogAt = now;
    log({ module: 'rate-limit', error }, 'Redis rate limiter unavailable; using bounded local fallback');
}
