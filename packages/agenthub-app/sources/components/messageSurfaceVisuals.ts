import type { Theme } from '@/theme';
import type { StatusChipTone } from '@/components/glass/glassStyles';
import type { ToolCall } from '@/sync/typesMessage';
import { t } from '@/text';

export function getUserMessageVisuals(theme: Theme) {
    return {
        backgroundColor: theme.dark ? 'rgba(255, 178, 46, 0.105)' : 'rgba(255, 249, 237, 0.82)',
        borderColor: theme.dark ? theme.colors.glass.edgeWarm : 'rgba(217, 144, 18, 0.26)',
        textColor: theme.colors.userMessageText,
    };
}

export function getAgentMessageVisuals(theme: Theme) {
    return {
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        textColor: theme.colors.text,
    };
}

export function getAgentEventVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.glass.background,
        borderColor: theme.colors.glass.border,
        textColor: theme.colors.agentEventText,
    };
}

export function getToolSurfaceVisuals(theme: Theme) {
    return {
        backgroundColor: theme.dark ? 'rgba(5, 8, 9, 0.94)' : 'rgba(232, 239, 241, 0.74)',
        materialBackgroundColor: theme.dark ? 'rgba(28, 36, 40, 0.82)' : 'rgba(255, 255, 255, 0.86)',
        contentBackgroundColor: theme.dark ? 'rgba(14, 20, 23, 0.48)' : 'rgba(250, 253, 253, 0.64)',
        borderColor: theme.dark ? 'rgba(238, 248, 250, 0.16)' : 'rgba(28, 44, 52, 0.15)',
        innerBorderColor: theme.dark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(255, 255, 255, 0.96)',
        dividerColor: theme.dark ? 'rgba(255, 255, 255, 0.055)' : 'rgba(28, 44, 52, 0.08)',
        shadowColor: theme.colors.glass.shadow,
        headerBackgroundColor: theme.dark ? 'rgba(255, 255, 255, 0.028)' : 'rgba(255, 255, 255, 0.74)',
    };
}

export function getToolStateTone(state: ToolCall['state']): StatusChipTone {
    switch (state) {
        case 'running':
            return 'running';
        case 'completed':
            return 'completed';
        case 'error':
            return 'error';
        default:
            return 'info';
    }
}

export function getToolStateLabel(state: ToolCall['state']): string {
    switch (state) {
        case 'running':
            return t('toolView.stateRunning');
        case 'completed':
            return t('toolView.stateCompleted');
        case 'error':
            return t('toolView.stateError');
        default:
            return t('toolView.stateUnknown');
    }
}
