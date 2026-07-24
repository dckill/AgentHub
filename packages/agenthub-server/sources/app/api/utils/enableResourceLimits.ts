import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ConcurrencyLimiter } from './resourceLimits';
import { DistributedFixedWindowRateLimiter, type RedisRateLimitClient } from './distributedRateLimits';
import { getRateLimitRedisClient, reportRateLimitRedisError } from './rateLimitRedis';

type ResourceLimitOptions = {
    readLimit?: number;
    mutationLimit?: number;
    windowMs?: number;
    mutationConcurrency?: number;
    maxSubjects?: number;
    redis?: RedisRateLimitClient;
};

export function enableResourceLimits(app: FastifyInstance, options: ResourceLimitOptions = {}): void {
    const windowMs = options.windowMs ?? 60_000;
    const maxSubjects = options.maxSubjects ?? 20_000;
    const redis = options.redis ?? getRateLimitRedisClient();
    const reads = new DistributedFixedWindowRateLimiter({ scope: 'http-read', limit: options.readLimit ?? 1_200, windowMs, maxFallbackSubjects: maxSubjects, redis, onRedisError: reportRateLimitRedisError });
    const mutations = new DistributedFixedWindowRateLimiter({ scope: 'http-mutation', limit: options.mutationLimit ?? 240, windowMs, maxFallbackSubjects: maxSubjects, redis, onRedisError: reportRateLimitRedisError });
    const inFlightMutations = new ConcurrencyLimiter(options.mutationConcurrency ?? 16);
    const releases = new WeakMap<FastifyRequest, () => void>();

    const release = (request: FastifyRequest) => {
        releases.get(request)?.();
        releases.delete(request);
    };

    app.addHook('onRequest', async (request, reply) => {
        const mutation = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
        const result = await (mutation ? mutations : reads).consume(request.ip);
        if (!result.allowed) {
            reply.header('Retry-After', String(Math.max(1, Math.ceil(result.retryAfterMs / 1_000))));
            return reply.code(429).send({ error: 'rate-limit', retryAfterMs: result.retryAfterMs });
        }
        if (mutation) {
            const acquired = inFlightMutations.acquire(request.ip);
            if (!acquired) {
                return reply.code(429).send({ error: 'too-many-in-flight-requests' });
            }
            releases.set(request, acquired);
        }
    });
    app.addHook('onResponse', async (request) => release(request));
    app.addHook('onError', async (request) => release(request));
}
