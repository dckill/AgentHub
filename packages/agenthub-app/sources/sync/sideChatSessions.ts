import type { Session } from './storageTypes';

export function isTopLevelSession(session: Session): boolean {
    return session.metadata?.isSideChat !== true;
}

export function selectSideChatSessions(sessions: Iterable<Session>, parentSessionId: string | null): Session[] {
    if (!parentSessionId) return [];
    return Array.from(sessions)
        .filter((session) => session.metadata?.isSideChat === true
            && session.metadata?.parentSessionId === parentSessionId
            && session.metadata?.lifecycleState !== 'archived')
        .sort((a, b) => a.createdAt - b.createdAt);
}
