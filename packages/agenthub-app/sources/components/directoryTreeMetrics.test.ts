import { describe, expect, it } from 'vitest';
import { getDirectoryTreeRowMetrics } from './directoryTreeMetrics';

const scale = (multiplier: number) => (value: number) => Math.max(1, Math.round(value * multiplier));

describe('directory tree row metrics', () => {
    it('keeps a 44px touch target while enlarging L-scale content', () => {
        expect(getDirectoryTreeRowMetrics(scale(0.8), true)).toEqual({
            rowMinHeight: 44,
            fontSize: 13,
            lineHeight: 18,
            fileIconSize: 22,
            folderIconSize: 19,
            chevronSize: 11,
        });
    });

    it('lets pointer-oriented rows become denser with the selected scale', () => {
        expect(getDirectoryTreeRowMetrics(scale(0.8), false).rowMinHeight).toBe(32);
    });

    it('keeps default-scale content proportional to a 44px row', () => {
        expect(getDirectoryTreeRowMetrics(scale(1), true)).toEqual({
            rowMinHeight: 44,
            fontSize: 16,
            lineHeight: 22,
            fileIconSize: 28,
            folderIconSize: 24,
            chevronSize: 14,
        });
    });
});
