import type { ApiEphemeralActivityUpdate } from './apiTypes';
import type { Session } from './storageTypes';
import { resolveActivityThinkingState } from '@/utils/sessionActivity';

type ActivitySession = Omit<Session, 'presence'> & { presence?: 'online' | number };

export function buildActivitySessionUpdates(
    updates: Map<string, ApiEphemeralActivityUpdate>,
    sessions: Record<string, Session>,
): ActivitySession[] {
    const changed: ActivitySession[] = [];
    for (const [sessionId, update] of updates) {
        const session = sessions[sessionId];
        if (!session) continue;

        const thinkingState = resolveActivityThinkingState(session, update);
        changed.push({
            ...session,
            active: update.active,
            activeAt: update.activeAt,
            thinking: thinkingState.thinking,
            thinkingAt: thinkingState.thinkingAt,
        });
    }
    return changed;
}
