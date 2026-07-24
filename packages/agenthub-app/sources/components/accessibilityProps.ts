import type { AccessibilityState } from 'react-native';

type AccessibleControlProps = {
    accessibilityRole: 'button' | 'tab';
    accessibilityLabel: string;
    accessibilityState: AccessibilityState;
    'aria-selected'?: boolean;
    'aria-expanded'?: boolean;
    'aria-disabled'?: boolean;
    'aria-busy'?: boolean;
};

export function getAccessibleTabProps(label: string, selected: boolean): AccessibleControlProps {
    return {
        accessibilityRole: 'tab',
        accessibilityLabel: label,
        accessibilityState: { selected },
        'aria-selected': selected,
    };
}

export function getAccessibleActionProps(
    label: string,
    state: AccessibilityState = {},
): AccessibleControlProps {
    return {
        accessibilityRole: 'button',
        accessibilityLabel: label,
        accessibilityState: state,
        ...(state.expanded === undefined ? {} : { 'aria-expanded': state.expanded }),
        ...(state.disabled === undefined ? {} : { 'aria-disabled': state.disabled }),
        ...(state.busy === undefined ? {} : { 'aria-busy': state.busy }),
    };
}
