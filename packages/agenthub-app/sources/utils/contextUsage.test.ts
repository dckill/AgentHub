import { describe, expect, it } from 'vitest';

import {
    getContextUsagePercent,
    resolveContextWindow,
    getContextRemainingPercent,
} from './contextUsage';

describe('context usage', () => {
    it('returns null when usage cannot be resolved', () => {
        expect(getContextUsagePercent({})).toBeNull();
    });

    it('uses reported context window before model fallbacks', () => {
        expect(getContextUsagePercent({
            contextSize: 321,
            contextWindow: 1000,
            flavor: 'codex',
            modelKey: 'gpt-5.5',
        })).toBe(32);
    });

    it('infers a Codex context window when the provider did not report one', () => {
        expect(resolveContextWindow({
            flavor: 'codex',
            modelKey: 'gpt-5.4',
        })).toBe(1_050_000);
    });

    it('infers Claude Code context windows conservatively', () => {
        expect(resolveContextWindow({
            flavor: 'claude',
            modelKey: 'default',
        })).toBe(200_000);

        expect(resolveContextWindow({
            flavor: 'claude',
            modelKey: 'claude-sonnet-4-5',
        })).toBe(200_000);

        expect(resolveContextWindow({
            flavor: 'claude',
            modelKey: 'claude-sonnet-4-6',
        })).toBe(1_000_000);

        expect(resolveContextWindow({
            flavor: 'claude',
            modelKey: 'haiku',
        })).toBe(200_000);
    });

    it('computes remaining percentage from the resolved window', () => {
        expect(getContextRemainingPercent({
            contextSize: 950,
            contextWindow: 1000,
            flavor: 'codex',
            modelKey: 'gpt-5.5',
        })).toBe(5);
    });

    it('shows a non-zero percent when usage is positive but below one percent', () => {
        expect(getContextUsagePercent({
            contextSize: 200,
            contextWindow: 100000,
            flavor: 'claude',
        })).toBe(1);
    });
});
