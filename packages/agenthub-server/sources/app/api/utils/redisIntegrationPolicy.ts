export type RedisIntegrationPolicy = {
    redisUrl: string | undefined;
    required: boolean;
};

/**
 * Resolve the Redis integration-test gate without changing production runtime
 * configuration. Local runs remain opt-in; deployment acceptance can require
 * a real Redis URL and fail before any test is skipped.
 */
export function resolveRedisIntegrationPolicy(
    env: Partial<Pick<NodeJS.ProcessEnv, 'AGENTHUB_TEST_REDIS_URL' | 'AGENTHUB_REQUIRE_REDIS_INTEGRATION'>> = process.env,
): RedisIntegrationPolicy {
    const redisUrl = env.AGENTHUB_TEST_REDIS_URL?.trim() || undefined;
    const required = env.AGENTHUB_REQUIRE_REDIS_INTEGRATION === 'true';
    if (required && !redisUrl) {
        throw new Error(
            'AGENTHUB_REQUIRE_REDIS_INTEGRATION=true requires AGENTHUB_TEST_REDIS_URL to run the Redis topology acceptance suite',
        );
    }
    return { redisUrl, required };
}
