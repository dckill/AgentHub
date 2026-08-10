import { describe, expect, it } from 'vitest';
import { buildNetworkTrendScale, formatNetworkRateTick } from './networkTrendScale';

describe('buildNetworkTrendScale', () => {
    it('provides four readable ticks for an idle connection', () => {
        const scale = buildNetworkTrendScale(0, null);

        expect(scale.maximum).toBe(64 * 1024);
        expect(scale.ticks).toHaveLength(4);
        expect(scale.ticks.at(-1)).toBe(0);
        expect(scale.ticks[0]).toBe(scale.maximum);
    });

    it('expands immediately and contracts gradually after a traffic spike', () => {
        const expanded = buildNetworkTrendScale(1_200_000, 64 * 1024);
        const contracted = buildNetworkTrendScale(40_000, expanded.maximum);

        expect(expanded.maximum).toBeGreaterThanOrEqual(1_200_000);
        expect(contracted.maximum).toBeLessThan(expanded.maximum);
        expect(contracted.maximum).toBeGreaterThan(64 * 1024);
    });

    it('formats axis values using compact transfer-rate units', () => {
        expect(formatNetworkRateTick(0)).toBe('0');
        expect(formatNetworkRateTick(512 * 1024)).toBe('512 KB/s');
        expect(formatNetworkRateTick(1.5 * 1024 * 1024)).toBe('1.5 MB/s');
    });
});
