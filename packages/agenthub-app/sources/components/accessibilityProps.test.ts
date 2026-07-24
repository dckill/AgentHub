import { describe, expect, it } from 'vitest';
import { getAccessibleActionProps, getAccessibleTabProps } from './accessibilityProps';

describe('accessibility props', () => {
    it('exposes selected state for tab controls', () => {
        expect(getAccessibleTabProps('Terminals', true)).toEqual({
            accessibilityRole: 'tab',
            accessibilityLabel: 'Terminals',
            accessibilityState: { selected: true },
            'aria-selected': true,
        });
    });

    it('preserves explicit action state while providing a button role', () => {
        expect(getAccessibleActionProps('Expand session settings', { expanded: false })).toEqual({
            accessibilityRole: 'button',
            accessibilityLabel: 'Expand session settings',
            accessibilityState: { expanded: false },
            'aria-expanded': false,
        });
    });

    it('exposes busy and disabled action state to authenticated Web controls', () => {
        expect(getAccessibleActionProps('Sync status', { busy: true, disabled: true })).toEqual({
            accessibilityRole: 'button',
            accessibilityLabel: 'Sync status',
            accessibilityState: { busy: true, disabled: true },
            'aria-busy': true,
            'aria-disabled': true,
        });
    });
});
