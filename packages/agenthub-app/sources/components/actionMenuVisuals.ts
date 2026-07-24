import type { Theme } from '@/theme';

export interface ActionMenuItemVisualInput {
    destructive?: boolean;
    disabled?: boolean;
    selected?: boolean;
}

export interface ActionMenuSurfaceVisuals {
    backgroundColor: string;
    backgroundGradientColors: [string, string, ...string[]];
    borderColor: string;
    headerGradientColors: [string, string, ...string[]];
    shadowColor: string;
    headerBackgroundColor: string;
    highlightColor: string;
    rimGlowColor: string;
    titleColor: string;
}

const LIGHT_MENU_BACKGROUND = '#FFFDF8';
const DARK_MENU_BACKGROUND = '#05090A';

export function getActionMenuSurfaceVisuals(theme: Theme): ActionMenuSurfaceVisuals {
    return {
        backgroundColor: theme.dark ? DARK_MENU_BACKGROUND : LIGHT_MENU_BACKGROUND,
        backgroundGradientColors: theme.dark
            ? ['rgba(255, 255, 255, 0.034)', 'rgba(5, 9, 10, 0.98)', 'rgba(0, 0, 0, 0.26)']
            : ['rgba(255, 255, 255, 0.86)', LIGHT_MENU_BACKGROUND, 'rgba(217, 137, 0, 0.028)'],
        borderColor: theme.dark ? 'rgba(226, 238, 243, 0.24)' : theme.colors.glass.borderStrong,
        headerGradientColors: theme.dark
            ? ['rgba(255, 255, 255, 0.060)', 'rgba(255, 196, 88, 0.050)', 'rgba(5, 9, 10, 0.18)']
            : ['#FFFDF8', '#FFF4DE'],
        shadowColor: theme.colors.glass.shadow,
        headerBackgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.026)' : '#FFF4DE',
        highlightColor: theme.colors.glass.edgeBright,
        rimGlowColor: theme.dark ? 'rgba(0, 0, 0, 0.34)' : 'rgba(217, 137, 0, 0.14)',
        titleColor: theme.colors.text,
    };
}

export function getActionMenuItemVisuals(theme: Theme, item: ActionMenuItemVisualInput) {
    const labelColor = item.destructive ? theme.colors.textDestructive : theme.colors.text;
    const iconColor = item.selected && !item.destructive ? theme.colors.accent : labelColor;

    return {
        iconColor,
        labelColor,
        checkColor: theme.colors.accent,
        opacity: item.disabled ? 0.46 : 1,
        accessibilityState: {
            selected: !!item.selected,
            disabled: !!item.disabled,
        },
    };
}
