import { describe, expect, it } from 'vitest';
import { getDirectoryTreeNodePaddingLeft } from './directoryTreeLayout';

describe('directory tree layout', () => {
    it('keeps regular directory levels visually nested', () => {
        expect(getDirectoryTreeNodePaddingLeft(0)).toBe(8);
        expect(getDirectoryTreeNodePaddingLeft(1)).toBe(22);
        expect(getDirectoryTreeNodePaddingLeft(4)).toBe(64);
    });

    it('caps very deep indentation so file rows still have visible label space', () => {
        expect(getDirectoryTreeNodePaddingLeft(20)).toBeLessThanOrEqual(112);
        expect(getDirectoryTreeNodePaddingLeft(40)).toBeLessThanOrEqual(112);
    });

    it('applies the same cap through scaled file-list layouts', () => {
        const scale = (value: number) => Math.max(1, Math.round(value * 0.8));

        expect(getDirectoryTreeNodePaddingLeft(4, scale)).toBe(51);
        expect(getDirectoryTreeNodePaddingLeft(40, scale)).toBeLessThanOrEqual(90);
    });
});
