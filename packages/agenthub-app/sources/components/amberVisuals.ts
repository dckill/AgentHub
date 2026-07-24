import type { Theme } from '@/theme';

export function getAmberGradientColors(theme: Theme): [string, string, string] {
    return theme.dark
        ? ['#FFD77A', '#FFAF2E', '#D77A00']
        : ['#FFE9B8', '#F6B33C', '#D99012'];
}

export function getAmberRaisedButtonVisuals(theme: Theme) {
    return {
        colors: getAmberGradientColors(theme),
        borderColor: theme.dark ? 'rgba(255, 226, 148, 0.58)' : 'rgba(217, 144, 18, 0.36)',
        highlightColor: theme.dark ? 'rgba(255, 255, 255, 0.22)' : 'rgba(255, 255, 255, 0.42)',
        secondaryHighlightColor: theme.dark ? 'rgba(255, 231, 170, 0.10)' : 'rgba(255, 255, 255, 0.18)',
        shadowColor: theme.colors.accentGlow,
        textColor: theme.colors.button.primary.tint,
    };
}
