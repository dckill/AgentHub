import { describe, expect, it } from 'vitest';
import { fromRateLimitEvent, mergeUsageLimits, synthesizeStatus, windowsFromGetUsage } from './usageLimits';

describe('Claude usage limit normalization', () => {
    it('normalizes the complete get_usage snapshot and ignores billing state', () => {
        expect(windowsFromGetUsage({
            five_hour: { utilization: 91.25, resets_at: '2026-08-03T06:00:00.000Z' },
            seven_day: { utilization: 20, resets_at: null },
            extra_usage: { utilization: 99, resets_at: null },
        })).toEqual([
            { id: 'five_hour', utilization: 91.25, resetsAt: Date.parse('2026-08-03T06:00:00.000Z'), status: 'allowed_warning' },
            { id: 'seven_day', utilization: 20, resetsAt: null, status: 'allowed' },
        ]);
    });

    it('normalizes event fractions and unix-second reset timestamps', () => {
        expect(fromRateLimitEvent({
            status: 'rejected',
            rateLimitType: 'five_hour',
            utilization: 0.999,
            resetsAt: 1_800_000_000,
        })).toEqual({
            window: { id: 'five_hour', status: 'rejected', utilization: 99.9, resetsAt: 1_800_000_000_000 },
        });
    });

    it('keeps an event without a window id visible as an unbound limit', () => {
        expect(fromRateLimitEvent({ status: 'allowed_warning' })).toEqual({
            unbound: { status: 'allowed_warning', utilization: null, resetsAt: null },
        });
    });

    it('preserves the last utilization when an allowed event omits it', () => {
        expect(mergeUsageLimits({
            capturedAt: 1,
            windows: [{ id: 'five_hour', utilization: 72, resetsAt: 200, status: 'allowed' }],
        }, {
            capturedAt: 2,
            windows: [{ id: 'five_hour', utilization: null, resetsAt: null, status: 'allowed' }],
        })).toEqual({
            capturedAt: 2,
            windows: [{ id: 'five_hour', utilization: 72, resetsAt: 200, status: 'allowed' }],
        });
    });

    it('applies an unbound rejection to the window closest to its limit', () => {
        const merged = mergeUsageLimits({
            capturedAt: 1,
            windows: [
                { id: 'five_hour', utilization: 40, status: 'allowed' },
                { id: 'seven_day', utilization: 88, status: 'allowed' },
            ],
        }, {
            capturedAt: 2,
            windows: [],
            unbound: { status: 'rejected' },
        });

        expect(merged.windows[1]).toMatchObject({ id: 'seven_day', utilization: 88, status: 'rejected' });
    });

    it('synthesizes warning and rejection thresholds', () => {
        expect(synthesizeStatus(89.9)).toBe('allowed');
        expect(synthesizeStatus(90)).toBe('allowed_warning');
        expect(synthesizeStatus(100)).toBe('rejected');
    });
});
