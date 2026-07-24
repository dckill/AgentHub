import type { Theme } from '@/theme';
import type { Theme as ReactNavigationTheme } from '@react-navigation/native';

type NavigationBaseTheme = {
    dark: boolean;
    colors: Record<string, string>;
};

const fallbackNavigationColors = {
    primary: '#000000',
    background: '#000000',
    card: '#000000',
    text: '#000000',
    border: '#000000',
    notification: '#000000',
};

export function getNavigationRootTheme(theme: Theme, baseTheme?: NavigationBaseTheme) {
    const base = baseTheme ?? {
        dark: theme.dark,
        colors: fallbackNavigationColors,
    };

    return {
        ...base,
        dark: theme.dark,
        colors: {
            ...base.colors,
            background: theme.colors.canvas,
            card: theme.colors.glass.raised,
            border: theme.colors.border,
            text: theme.colors.text,
            primary: theme.colors.accent,
            notification: theme.colors.warning,
        },
    };
}

export function getReactNavigationTheme(theme: Theme, baseTheme: ReactNavigationTheme): ReactNavigationTheme {
    return getNavigationRootTheme(theme, baseTheme) as ReactNavigationTheme;
}

export function getNavigationStackVisuals(theme: Theme) {
    return {
        contentBackgroundColor: theme.colors.canvas,
        headerBackgroundColor: theme.colors.glass.raised,
        headerTintColor: theme.colors.text,
        headerBorderColor: theme.colors.border,
    };
}

export function getNavigationHeaderVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.glass.raised,
        transparentBackgroundColor: theme.colors.canvas,
        borderColor: theme.colors.border,
        tintColor: theme.colors.text,
        subtitleColor: theme.colors.textSecondary,
        shadowColor: theme.colors.glass.shadow,
        highlightColor: theme.colors.glass.highlight,
    };
}

export function getStatusBarVisuals(theme: Theme) {
    const style: 'light' | 'dark' = theme.dark ? 'light' : 'dark';

    return {
        style,
        backgroundColor: theme.colors.canvas,
    };
}
