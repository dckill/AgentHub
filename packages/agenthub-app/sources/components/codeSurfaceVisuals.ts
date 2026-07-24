import type { Theme } from '@/theme';

export function getCodeBlockVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.codeSurface.background,
        borderColor: theme.colors.codeSurface.border,
        headerBackgroundColor: theme.colors.codeSurface.headerBackground,
        headerBorderColor: theme.colors.codeSurface.border,
        textColor: theme.dark ? theme.colors.terminal.stdout : theme.colors.syntaxDefault,
        languageColor: theme.dark ? theme.colors.textSecondary : theme.colors.textMuted,
        gutterBackgroundColor: theme.colors.codeSurface.gutterBackground,
        gutterBorderColor: theme.colors.codeSurface.gutterBorder,
        copyButtonBackgroundColor: theme.colors.surfaceHighest,
        copyButtonBorderColor: theme.colors.glass.border,
        copyButtonTextColor: theme.colors.text,
    };
}

export function getTerminalSurfaceVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.terminal.background,
        borderColor: theme.colors.glass.border,
        promptColor: theme.colors.terminal.prompt,
        commandColor: theme.colors.terminal.command,
    };
}

export function getDiffHeaderVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.codeSurface.headerBackground,
        borderColor: theme.colors.codeSurface.border,
        textColor: theme.colors.textSecondary,
        iconColor: theme.colors.accent,
    };
}

export function getDiffStatColors(theme: Theme) {
    return {
        addedText: theme.colors.diff.addedText,
        removedText: theme.colors.diff.removedText,
        addedBackground: theme.colors.diff.addedBg,
        removedBackground: theme.colors.diff.removedBg,
    };
}
