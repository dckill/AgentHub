import { createHash } from 'node:crypto';
import { FixedWindowRateLimiter } from './resourceLimits';

export type RedisRateLimitClient = {
    eval(script: string, numberOfKeys: number, ...args: string[]): Promise<unknown>;
};

type DistributedRateLimitOptions = {
    scope: string;
    limit: number;
    windowMs: number;
    maxFallbackSubjects: number;
    redis?: RedisRateLimitClient;
    now?: () => number;
    onRedisError?: (error: unknown) => void;
};

const CONSUME_FIXED_WINDOW_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('PEXPIRE', KEYS[1], ARGV[1])
end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

export class DistributedFixedWindowRateLimiter {
    private readonly fallback: FixedWindowRateLimiter;

    constructor(private readonly options: DistributedRateLimitOptions) {
        this.fallback = new FixedWindowRateLimiter({
            limit: options.limit,
            windowMs: options.windowMs,
            maxSubjects: options.maxFallbackSubjects,
            now: options.now,
        });
    }

    get fallbackSize(): number {
        return this.fallback.size;
    }

    async consume(subject: string): Promise<{ allowed: boolean; retryAfterMs: number }> {
        if (!this.options.redis) return this.fallback.consume(subject);
        try {
            const digest = createHash('sha256').update(subject).digest('hex').slice(0, 32);
            const key = `agenthub:rate:${this.options.scope}:${digest}`;
            const response = await this.options.redis.eval(
                CONSUME_FIXED_WINDOW_LUA,
                1,
                key,
                String(this.options.windowMs),
            );
            if (!Array.isArray(response) || response.length < 2) throw new Error('Invalid Redis rate-limit response');
            const count = Number(response[0]);
            const ttl = Number(response[1]);
            if (!Number.isFinite(count) || !Number.isFinite(ttl)) throw new Error('Invalid Redis rate-limit counters');
            return count <= this.options.limit
                ? { allowed: true, retryAfterMs: 0 }
                : { allowed: false, retryAfterMs: Math.max(1, ttl > 0 ? ttl : this.options.windowMs) };
        } catch (error) {
            this.options.onRedisError?.(error);
            return this.fallback.consume(subject);
        }
    }
}
