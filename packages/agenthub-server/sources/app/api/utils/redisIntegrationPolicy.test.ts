import { describe, expect, it } from 'vitest';
import { resolveRedisIntegrationPolicy } from './redisIntegrationPolicy';

describe('resolveRedisIntegrationPolicy', () => {
    it('keeps local runs optional when no Redis URL is configured', () => {
        expect(resolveRedisIntegrationPolicy({})).toEqual({
            redisUrl: undefined,
            required: false,
        });
    });

    it('preserves the configured URL for integration tests', () => {
        expect(resolveRedisIntegrationPolicy({ AGENTHUB_TEST_REDIS_URL: ' redis://localhost:6379 ' })).toEqual({
            redisUrl: 'redis://localhost:6379',
            required: false,
        });
    });

    it('fails fast when the deployment gate requires a missing URL', () => {
        expect(() => resolveRedisIntegrationPolicy({ AGENTHUB_REQUIRE_REDIS_INTEGRATION: 'true' })).toThrow(
            'AGENTHUB_REQUIRE_REDIS_INTEGRATION=true requires AGENTHUB_TEST_REDIS_URL',
        );
    });

    it('allows a required deployment gate with a configured URL', () => {
        expect(resolveRedisIntegrationPolicy({
            AGENTHUB_TEST_REDIS_URL: 'redis://redis.internal:6379',
            AGENTHUB_REQUIRE_REDIS_INTEGRATION: 'true',
        })).toEqual({
            redisUrl: 'redis://redis.internal:6379',
            required: true,
        });
    });
});
