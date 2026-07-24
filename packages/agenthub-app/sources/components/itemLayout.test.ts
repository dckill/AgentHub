import { describe, expect, it } from 'vitest';
import { shouldSplitInteractiveItem } from './itemLayout';

describe('item layout', () => {
    it('splits an interactive right element from an interactive item row', () => {
        expect(shouldSplitInteractiveItem({
            hasRowPress: true,
            hasRightElement: true,
            rightElementInteractive: true,
        })).toBe(true);
    });

    it('keeps passive right content inside the row', () => {
        expect(shouldSplitInteractiveItem({
            hasRowPress: true,
            hasRightElement: true,
            rightElementInteractive: false,
        })).toBe(false);
    });
});
