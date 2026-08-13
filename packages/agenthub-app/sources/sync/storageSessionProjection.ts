import type { Session } from './storageTypes';
import type { SessionMessages } from './storage';
import { isSessionActive } from './storageProjection';
import { selectRetainedSessionMessageIds } from './sessionMessageIndex';

const MAX_RETAINED_INACTIVE_SESSION_MESSAGES = 20;
const LOCAL_ARCHIVE_LIFECYCLE_STATES = new Set([
    'archiveRequested',
    'exited',
    'timeout',
    'not-found',
    'archived',
]);

export type SessionInput = Omit<Session, 'presence'> & { presence?: 'online' | number };

export function boundSessionMessages(
    sessions: Readonly<Record<string, Session>>,
    sessionMessages: Readonly<Record<string, SessionMessages>>,
): Record<string, SessionMessages> {
    const retainedMessageIds = selectRetainedSessionMessageIds(
        Object.fromEntries(Object.entries(sessions).map(([id, session]) => [id, {
            active: isSessionActive(session),
            updatedAt: session.updatedAt,
        }])),
        Object.keys(sessionMessages),
        MAX_RETAINED_INACTIVE_SESSION_MESSAGES,
    );
    return Object.fromEntries(
        Object.entries(sessionMessages).filter(([id]) => retainedMessageIds.has(id)),
    );
}

export function applyBoundedSessionMessageUpdate(
    sessions: Readonly<Record<string, Session>>,
    sessionMessages: Readonly<Record<string, SessionMessages>>,
    sessionId: string,
    nextSessionMessages: SessionMessages,
): Record<string, SessionMessages> {
    const updatedSessionMessages = {
        ...sessionMessages,
        [sessionId]: nextSessionMessages,
    };
    const session = sessions[sessionId];
    if (!session || isSessionActive(session)) {
        return updatedSessionMessages;
    }
    return boundSessionMessages(sessions, updatedSessionMessages);
}

export function preserveNewerLocalArchiveProjection(existing: Session | undefined, incoming: SessionInput): SessionInput {
    const existingState = existing?.metadata?.lifecycleState;
    if (!existing || !existingState || !LOCAL_ARCHIVE_LIFECYCLE_STATES.has(existingState)) {
        return incoming;
    }

    const existingSince = existing.metadata?.lifecycleStateSince ?? existing.updatedAt;
    const incomingSince = incoming.metadata?.lifecycleStateSince ?? incoming.updatedAt;
    if (existingSince < incomingSince) {
        return incoming;
    }

    return {
        ...incoming,
        active: existing.active,
        activeAt: existing.activeAt,
        thinking: existing.thinking,
        thinkingAt: existing.thinkingAt,
        metadata: incoming.metadata
            ? {
                ...incoming.metadata,
                lifecycleState: existingState,
                lifecycleStateSince: existing.metadata?.lifecycleStateSince ?? existingSince,
                ...(existing.metadata?.archivedBy ? { archivedBy: existing.metadata.archivedBy } : {}),
                ...(existing.metadata?.archiveReason ? { archiveReason: existing.metadata.archiveReason } : {}),
            }
            : existing.metadata,
    };
}
