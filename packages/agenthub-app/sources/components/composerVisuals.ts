import type { Theme } from '@/theme';

export type ComposerSendState = 'active' | 'idle' | 'locked';
type ComposerSendButtonVisuals = {
    backgroundColor: string;
    borderColor: string;
    iconColor: string;
    gradientColors?: readonly [string, string, string];
    highlightColor?: string;
    secondaryHighlightColor?: string;
    shadowColor?: string;
    shadowOpacity?: number;
    elevation?: number;
};
type ComposerSendButtonHighlightScale = (value: number) => number;
type ComposerSendButtonHighlightStyle = {
    top: number;
    left: number;
    width: number;
    height: number;
    borderRadius: number;
    transform: { rotate: string }[];
};

const LIGHT_OVERLAY_BACKGROUND = '#FFFDF8';
const DARK_OVERLAY_BACKGROUND = '#05090A';

export function getComposerPanelVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.glass.raised,
        borderColor: theme.colors.glass.border,
        gradientColors: theme.dark
            ? ['rgba(255, 255, 255, 0.050)', 'rgba(17, 24, 27, 0.30)', 'rgba(0, 0, 0, 0.20)'] as const
            : ['rgba(255, 255, 255, 0.76)', 'rgba(238, 246, 248, 0.34)', 'rgba(217, 144, 18, 0.030)'] as const,
        topHighlightColor: theme.colors.glass.edgeBright,
        bottomShadeColor: theme.dark ? 'rgba(0, 0, 0, 0.22)' : 'rgba(28, 44, 52, 0.050)',
        shadowColor: theme.colors.glass.shadow,
        inputTextColor: theme.colors.input.text,
        placeholderColor: theme.colors.input.placeholder,
    };
}

export function getComposerActionButtonVisuals(theme: Theme, selected = false) {
    return {
        backgroundColor: selected ? theme.colors.accentSoft : 'transparent',
        iconColor: theme.colors.accent,
        pressedBackgroundColor: theme.colors.accentSoft,
    };
}

export function getComposerSendButtonVisuals(theme: Theme, state: ComposerSendState): ComposerSendButtonVisuals {
    if (state === 'active') {
        return {
            backgroundColor: theme.colors.accent,
            borderColor: theme.colors.accent,
            iconColor: theme.colors.button.primary.tint,
        };
    }

    if (state === 'locked') {
        return {
            backgroundColor: theme.dark ? 'rgba(170, 181, 188, 0.18)' : '#D5DBDF',
            borderColor: theme.dark ? 'rgba(217, 225, 229, 0.24)' : 'rgba(143, 154, 162, 0.42)',
            iconColor: theme.dark ? 'rgba(226, 233, 236, 0.72)' : '#68737B',
            gradientColors: theme.dark
                ? ['rgba(241, 245, 247, 0.30)', 'rgba(145, 157, 165, 0.18)', 'rgba(72, 83, 91, 0.22)']
                : ['#F4F6F7', '#D6DDE1', '#AEB8BF'],
            highlightColor: theme.dark ? 'rgba(255, 255, 255, 0.16)' : 'rgba(255, 255, 255, 0.58)',
            secondaryHighlightColor: theme.dark ? 'rgba(255, 255, 255, 0.070)' : 'rgba(255, 255, 255, 0.22)',
            shadowColor: theme.dark ? 'rgba(0, 0, 0, 0.56)' : 'rgba(112, 124, 132, 0.26)',
            shadowOpacity: theme.dark ? 0.18 : 0.14,
            elevation: 2,
        };
    }

    return {
        backgroundColor: theme.dark ? 'rgba(170, 181, 188, 0.20)' : '#DCE2E5',
        borderColor: theme.dark ? 'rgba(217, 225, 229, 0.22)' : 'rgba(155, 166, 174, 0.36)',
        iconColor: theme.dark ? 'rgba(226, 233, 236, 0.74)' : '#707B83',
        gradientColors: theme.dark
            ? ['rgba(247, 250, 251, 0.32)', 'rgba(157, 169, 176, 0.20)', 'rgba(80, 92, 100, 0.24)']
            : ['#F8F9FA', '#DDE4E7', '#B9C3C9'],
        highlightColor: theme.dark ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.64)',
        secondaryHighlightColor: theme.dark ? 'rgba(255, 255, 255, 0.080)' : 'rgba(255, 255, 255, 0.26)',
        shadowColor: theme.dark ? 'rgba(0, 0, 0, 0.58)' : 'rgba(118, 130, 138, 0.28)',
        shadowOpacity: theme.dark ? 0.20 : 0.16,
        elevation: 2,
    };
}

export function getComposerSendButtonChrome(theme: Theme) {
    return {
        size: 40,
        borderRadius: 20,
        shadowColor: theme.colors.accentGlow,
        shadowOpacity: theme.dark ? 0.34 : 0.24,
        shadowRadius: 16,
        shadowOffset: { width: 0, height: 8 },
        elevation: 5,
        iconColor: theme.colors.button.primary.tint,
        iconTranslateX: -1,
        iconTranslateY: 1,
    };
}

export function getComposerSendButtonHighlightGeometry(scale: ComposerSendButtonHighlightScale = (value) => value): {
    primary: ComposerSendButtonHighlightStyle;
    secondary: ComposerSendButtonHighlightStyle;
} {
    return {
        primary: {
            top: scale(4),
            left: scale(9),
            width: scale(18),
            height: scale(9),
            borderRadius: 999,
            transform: [{ rotate: '-18deg' }],
        },
        secondary: {
            top: scale(15),
            left: scale(13),
            width: scale(13),
            height: scale(11),
            borderRadius: 999,
            transform: [{ rotate: '-18deg' }],
        },
    };
}

export function getComposerActionRowLayout() {
    return {
        minActionRailWidth: 0,
        sendGap: 12,
        actionIconMinWidth: 32,
    };
}

export function getComposerSupplementalSurfaceVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.glass.background,
        borderColor: theme.colors.glass.border,
    };
}

export function getComposerOverlayVisuals(theme: Theme) {
    return {
        backgroundColor: theme.dark ? DARK_OVERLAY_BACKGROUND : LIGHT_OVERLAY_BACKGROUND,
        borderColor: theme.dark ? 'rgba(226, 238, 243, 0.22)' : theme.colors.glass.borderStrong,
        backgroundGradientColors: theme.dark
            ? ['rgba(255, 255, 255, 0.026)', 'rgba(5, 9, 10, 0.98)', 'rgba(0, 0, 0, 0.24)'] as const
            : ['rgba(255, 255, 255, 0.78)', LIGHT_OVERLAY_BACKGROUND, 'rgba(217, 144, 18, 0.026)'] as const,
        innerRimColor: theme.dark ? 'rgba(0, 0, 0, 0.34)' : 'rgba(255, 255, 255, 0.52)',
        topHighlightColor: theme.dark ? 'transparent' : theme.colors.glass.edgeBright,
        cornerGlowColor: theme.dark ? 'transparent' : 'rgba(255, 255, 255, 0.34)',
        bottomShadeColor: theme.dark ? 'rgba(0, 0, 0, 0.34)' : 'rgba(70, 48, 16, 0.032)',
        shadowColor: theme.colors.glass.shadow,
        shadowOpacity: theme.dark ? 0.38 : 0.16,
        shadowRadius: theme.dark ? 30 : 20,
        shadowOffset: theme.dark ? { width: 0, height: 18 } : { width: 0, height: 12 },
    };
}
