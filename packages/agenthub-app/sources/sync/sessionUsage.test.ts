import { describe, expect, it } from 'vitest';

import { buildLatestUsageFromEphemeral } from './sessionUsage';

describe('session usage', () => {
    it('builds latestUsage from partial usage ephemeral updates', () => {
        expect(buildLatestUsageFromEphemeral({
            type: 'usage',
            id: 'session-1',
            key: 'codex-session',
            timestamp: 123,
            tokens: {
                total: 17,
                input: 10,
                cache_read: 2,
            },
            cost: {
                total: 0.001,
            },
        })).toEqual({
            inputTokens: 10,
            outputTokens: 0,
            cacheCreation: 0,
            cacheRead: 2,
            contextSize: 12,
            timestamp: 123,
        });
    });

    it('falls back to total tokens when no context breakdown is present', () => {
        expect(buildLatestUsageFromEphemeral({
            type: 'usage',
            id: 'session-1',
            key: 'codex-session',
            timestamp: 124,
            tokens: {
                total: 42,
            },
            cost: {
                total: 0,
            },
        }).contextSize).toBe(42);
    });

    it('prefers explicit context tokens and carries the context window', () => {
        expect(buildLatestUsageFromEphemeral({
            type: 'usage',
            id: 'session-1',
            key: 'codex-session',
            timestamp: 125,
            tokens: {
                total: 321,
                input: 250,
                output: 60,
                cache_read: 40,
                context: 321,
                context_window: 1000,
            },
            cost: {
                total: 0,
            },
        })).toEqual({
            inputTokens: 250,
            outputTokens: 60,
            cacheCreation: 0,
            cacheRead: 40,
            contextSize: 321,
            contextWindow: 1000,
            timestamp: 125,
        });
    });
});
