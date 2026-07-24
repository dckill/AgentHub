import { describe, expect, it } from 'vitest';

import { getInitialActionMenuFocusIndex } from './actionMenuAccessibility';

describe('action menu accessibility', () => {
    it('focuses the first enabled action instead of the backdrop or a disabled action', () => {
        expect(getInitialActionMenuFocusIndex([
            { disabled: true },
            { disabled: false },
            {},
        ])).toBe(1);
    });

    it('does not invent a focus target when every action is disabled', () => {
        expect(getInitialActionMenuFocusIndex([
            { disabled: true },
            { disabled: true },
        ])).toBe(-1);
    });
});
