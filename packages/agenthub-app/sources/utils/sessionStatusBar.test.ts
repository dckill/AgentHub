import { describe, expect, it } from 'vitest';
import {
    formatUsageLimitAge,
    getContextUsageLevel,
    getContextUsagePercentage,
    getUsageLimitChips,
    getUsageLimitDisplayPercentage,
    getUsageLimitRows,
    resolveStatusBarGitBranch,
} from './sessionStatusBar';

describe('session status bar view model', () => {
    it('prefers live git status and falls back to metadata', () => {
        expect(resolveStatusBarGitBranch(' feature/live ', 'main')).toBe('feature/live');
        expect(resolveStatusBarGitBranch('', ' main ')).toBe('main');
    });

    it('uses the real context window and exposes warning levels', () => {
        expect(getContextUsagePercentage(180_000, 200_000)).toBe(90);
        expect(getContextUsageLevel(180_000, 200_000)).toBe('warning');
        expect(getContextUsageLevel(190_000, 200_000)).toBe('critical');
    });

    it('does not estimate context usage before the server reports a window', () => {
        expect(getContextUsagePercentage(180_000, undefined)).toBe(0);
        expect(getContextUsageLevel(180_000, undefined)).toBe('normal');
    });

    it('orders known limit windows and clamps percentages', () => {
        const limits = {
            capturedAt: 1,
            windows: [
                { id: 'seven_day', utilization: 105, status: 'rejected' },
                { id: 'five_hour', utilization: 42, status: 'allowed' },
            ],
        };
        expect(getUsageLimitChips(limits, false).map((chip) => [chip.id, chip.utilization])).toEqual([
            ['five_hour', 42],
            ['seven_day', 100],
        ]);
        expect(getUsageLimitRows(limits).map((row) => row.id)).toEqual(['five_hour', 'seven_day']);
    });

    it('collapses narrow layouts to the closest limit', () => {
        const chips = getUsageLimitChips({
            capturedAt: 1,
            windows: [
                { id: 'five_hour', utilization: 91 },
                { id: 'seven_day', utilization: 60 },
            ],
        }, true);
        expect(chips).toHaveLength(1);
        expect(chips[0].id).toBe('five_hour');
    });

    it('never hides an unknown rejected limit', () => {
        expect(getUsageLimitChips({
            capturedAt: 1,
            windows: [{ id: 'plan', status: 'rejected' }],
        }, false)).toEqual([{ id: 'plan', shortLabel: 'Plan', utilization: 100, status: 'rejected' }]);
    });

    it('supports used and remaining display without mutating wire semantics', () => {
        expect(getUsageLimitDisplayPercentage(73, false)).toBe(73);
        expect(getUsageLimitDisplayPercentage(73, true)).toBe(27);
    });

    it('formats snapshot age compactly', () => {
        expect(formatUsageLimitAge(0, 30_000)).toBe('<1m');
        expect(formatUsageLimitAge(0, 3 * 3_600_000)).toBe('3h');
    });
});
