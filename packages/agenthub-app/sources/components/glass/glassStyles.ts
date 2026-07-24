import type { Theme } from '@/theme';

export type GlassButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type StatusChipTone = 'active' | 'running' | 'completed' | 'pending' | 'error' | 'offline' | 'info';

export function getGlassButtonColors(theme: Theme, variant: GlassButtonVariant) {
    switch (variant) {
        case 'primary':
            return {
                backgroundColor: theme.colors.button.primary.background,
                borderColor: theme.colors.button.primary.background,
                textColor: theme.colors.button.primary.tint,
            };
        case 'danger':
            return {
                backgroundColor: theme.colors.box.error.background,
                borderColor: theme.colors.textDestructive,
                textColor: theme.colors.textDestructive,
            };
        case 'ghost':
            return {
                backgroundColor: 'transparent',
                borderColor: 'transparent',
                textColor: theme.colors.textSecondary,
            };
        case 'secondary':
        default:
            return {
                backgroundColor: theme.colors.glass.raised,
                borderColor: theme.colors.border,
                textColor: theme.colors.text,
            };
    }
}

export function getStatusChipColors(theme: Theme, tone: StatusChipTone) {
    if (tone === 'error') {
        return {
            backgroundColor: theme.dark ? theme.colors.box.error.background : 'rgba(255, 241, 239, 0.78)',
            borderColor: theme.dark ? 'rgba(239, 61, 61, 0.18)' : 'rgba(190, 51, 44, 0.18)',
            textColor: theme.colors.textDestructive,
            dotColor: theme.colors.textDestructive,
        };
    }

    if (tone === 'completed' || tone === 'active') {
        return {
            backgroundColor: theme.dark ? 'rgba(80, 200, 120, 0.13)' : 'rgba(235, 249, 241, 0.78)',
            borderColor: theme.dark ? 'rgba(80, 200, 120, 0.16)' : 'rgba(18, 131, 74, 0.16)',
            textColor: theme.dark ? theme.colors.success : theme.colors.text,
            dotColor: theme.colors.success,
        };
    }

    if (tone === 'running' || tone === 'pending') {
        return {
            backgroundColor: theme.dark ? theme.colors.accentSoft : 'rgba(255, 248, 235, 0.82)',
            borderColor: theme.dark ? 'rgba(255, 178, 46, 0.18)' : 'rgba(217, 144, 18, 0.20)',
            textColor: theme.dark ? theme.colors.accent : theme.colors.text,
            dotColor: theme.colors.accent,
        };
    }

    if (tone === 'info') {
        return {
            backgroundColor: theme.dark ? 'rgba(95, 168, 255, 0.13)' : 'rgba(236, 244, 255, 0.78)',
            borderColor: theme.dark ? 'rgba(95, 168, 255, 0.16)' : 'rgba(39, 109, 212, 0.16)',
            textColor: theme.colors.textLink,
            dotColor: theme.colors.textLink,
        };
    }

    return {
        backgroundColor: theme.dark ? theme.colors.glass.background : 'rgba(255, 255, 255, 0.72)',
        borderColor: theme.dark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(28, 44, 52, 0.10)',
        textColor: theme.colors.textSecondary,
        dotColor: theme.colors.textMuted,
    };
}

export function getGlassTextFieldColors(theme: Theme, focused = false, error = false) {
    if (error) {
        return {
            backgroundColor: theme.colors.input.background,
            borderColor: theme.colors.textDestructive,
            textColor: theme.colors.input.text,
            placeholderColor: theme.colors.input.placeholder,
        };
    }

    return {
        backgroundColor: theme.colors.input.background,
        borderColor: focused ? theme.colors.borderStrong : theme.colors.border,
        textColor: theme.colors.input.text,
        placeholderColor: theme.colors.input.placeholder,
    };
}
