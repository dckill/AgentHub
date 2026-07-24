import type { Theme } from '@/theme';

export type ChatCanvasTextureVisuals = {
    enabled: boolean;
    baseGradientColors: [string, string, string];
    mistGradientColors: [string, string];
    verticalLineColor: string;
    horizontalLineColor: string;
    diagonalSheenColor: string;
    topSheenColor: string;
};

export function getChatShellVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.canvas,
        contentBackgroundColor: theme.colors.canvas,
        inputBackgroundColor: theme.colors.glass.background,
        inputBorderColor: theme.colors.glass.border,
        overlayColor: theme.colors.overlay.scrim,
    };
}

export function getChatCanvasTextureVisuals(theme: Theme): ChatCanvasTextureVisuals {
    return {
        enabled: true,
        baseGradientColors: theme.dark
            ? ['rgba(255, 255, 255, 0.018)', 'rgba(255, 255, 255, 0)', 'rgba(255, 178, 46, 0.012)']
            : ['rgba(255, 255, 255, 0.74)', 'rgba(232, 241, 244, 0.34)', 'rgba(217, 144, 18, 0.026)'],
        mistGradientColors: theme.dark
            ? ['rgba(255, 255, 255, 0.018)', 'rgba(255, 255, 255, 0)']
            : ['rgba(255, 255, 255, 0.50)', 'rgba(221, 234, 240, 0)'],
        verticalLineColor: theme.dark ? 'rgba(238, 248, 250, 0.026)' : 'rgba(28, 44, 52, 0.026)',
        horizontalLineColor: theme.dark ? 'rgba(238, 248, 250, 0.018)' : 'rgba(28, 44, 52, 0.018)',
        diagonalSheenColor: theme.dark ? 'rgba(255, 255, 255, 0.020)' : 'rgba(255, 255, 255, 0.58)',
        topSheenColor: theme.dark ? 'rgba(255, 255, 255, 0.028)' : 'rgba(255, 255, 255, 0.50)',
    };
}

export function getChatHeaderVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.glass.raised,
        borderColor: theme.colors.glass.border,
        tintColor: theme.colors.text,
        mutedColor: theme.colors.textSecondary,
        shadowColor: theme.colors.glass.shadow,
    };
}

export function getChatFooterVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.accentSoft,
        borderColor: theme.colors.box.warning.border,
        textColor: theme.colors.box.warning.text,
    };
}
