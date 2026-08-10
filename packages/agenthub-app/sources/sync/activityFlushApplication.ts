import type { ApiEphemeralActivityUpdate } from './apiTypes';
import type { Session } from './storageTypes';
import { buildActivitySessionUpdates } from './activityUpdateFlush';

type ActivitySession = Omit<Session, 'presence'> & { presence?: 'online' | number };

export type ActivityFlushApplicationParams = {
    updates: Map<string, ApiEphemeralActivityUpdate>;
    sessions: Record<string, Session>;
    applySessions: (sessions: ActivitySession[]) => void;
};

/** Project and apply one accumulated activity batch, skipping empty results. */
export function applyActivityFlush(params: ActivityFlushApplicationParams): number {
    const sessions = buildActivitySessionUpdates(params.updates, params.sessions);
    if (sessions.length > 0) {
        params.applySessions(sessions);
    }
    return sessions.length;
}
