import type { SessionRowData } from '@/sync/storageProjection';

export type SessionRowActionMenuKind = 'agenthub' | 'official';

export const OFFICIAL_CANDIDATE_ACTION_LABEL_KEYS = {
    takeOver: 'project.takeOverComputerSession',
    removeFromWorkbench: 'project.hideComputerSession',
} as const;

export function getSessionRowActionMenuKind(session: Pick<SessionRowData, 'source'>): SessionRowActionMenuKind {
    return session.source === 'official-codex' || session.source === 'official-claude'
        ? 'official'
        : 'agenthub';
}
