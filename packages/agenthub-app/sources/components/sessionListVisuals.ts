import type { Theme } from '@/theme';
import type { StatusChipTone } from '@/components/glass/glassStyles';
import type { SessionState } from '@/utils/sessionUtils';

export type AgentLabelChipKind = 'codex' | 'claude';

export function getProjectCardVisuals(theme: Theme) {
    return {
        backgroundColor: theme.colors.glass.raised,
        borderColor: theme.colors.glass.border,
        shadowColor: theme.colors.glass.shadow,
    };
}

export function getSessionRowVisuals(theme: Theme, selected?: boolean) {
    return {
        backgroundColor: selected ? theme.colors.accentSoft : theme.colors.glass.background,
        borderColor: selected ? theme.colors.borderStrong : theme.colors.divider,
    };
}

export function getSessionStateChip(state: SessionState, label: string): { label: string; tone: StatusChipTone } {
    switch (state) {
        case 'thinking':
            return { label, tone: 'running' };
        case 'permission_required':
            return { label, tone: 'pending' };
        case 'waiting':
            return { label, tone: 'active' };
        case 'disconnected':
        default:
            return { label, tone: 'offline' };
    }
}

export function getAgentLabelChipVisuals(theme: Theme, kind: AgentLabelChipKind) {
    if (kind === 'codex') {
        return {
            backgroundColor: theme.dark ? 'rgba(95, 168, 255, 0.16)' : 'rgba(47, 115, 217, 0.12)',
            textColor: theme.dark ? theme.colors.textLink : theme.colors.text,
        };
    }

    return {
        backgroundColor: theme.dark ? 'rgba(80, 200, 120, 0.14)' : 'rgba(21, 138, 75, 0.11)',
        textColor: theme.dark ? theme.colors.success : theme.colors.text,
    };
}
