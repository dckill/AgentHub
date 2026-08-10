import type { AccountRequest } from './accountLifecycle';
import { fetchCompleteCursorSnapshot } from './cursorSnapshot';
import {
    applySessionSnapshot,
    decryptSessionSnapshot,
    type SessionSnapshotApplicationResult,
    type SessionSnapshotRecord,
} from './sessionSnapshotApplication';
import { applySessionSnapshotSync } from './sessionSnapshotSyncApplication';
import type { Session } from './storageTypes';

type SnapshotSession = Omit<Session, 'presence'> & { presence?: Session['presence'] };

type SessionSnapshotEncryption = Parameters<typeof decryptSessionSnapshot>[0]['encryption'];

export interface SessionSnapshotSyncOptions {
    generation: number;
    assertCurrent: () => void;
    existingSessions: Record<string, Session>;
    existingSessionIdsAtStart: string[];
    runRequest: <T>(
        generation: number,
        operation: (request: AccountRequest) => Promise<T>,
    ) => Promise<T>;
    fetchPage: (
        cursor: string | null,
        signal: AbortSignal,
    ) => Promise<{
        items: SessionSnapshotRecord[];
        nextCursor: string | null;
        hasNext: boolean;
    }>;
    encryption: SessionSnapshotEncryption;
    applySessions: (sessions: SnapshotSession[], persist: boolean) => void;
    scheduleRetry: () => void;
    onIgnoredEmptySnapshot: () => void;
    log: (message: string) => void;
}

/** Fetch, decrypt, reconcile, and apply one authoritative session snapshot. */
export async function runSessionSnapshotSync(
    options: SessionSnapshotSyncOptions,
): Promise<SessionSnapshotApplicationResult> {
    const snapshot = await options.runRequest(options.generation, async (request) => {
        const sessions = await fetchCompleteCursorSnapshot<SessionSnapshotRecord>(async (cursor) => {
            const page = await options.fetchPage(cursor, request.signal);
            request.assertCurrent();
            return page;
        });

        return {
            rawSessionIds: sessions.map((session) => session.id),
            decryptedSessions: await decryptSessionSnapshot({
                sessions,
                existingSessions: options.existingSessions,
                encryption: options.encryption,
                request,
            }),
        };
    });
    options.assertCurrent();

    const appliedSnapshot = applySessionSnapshotSync({
        snapshot: applySessionSnapshot({
            ...snapshot,
            existingSessions: options.existingSessions,
            existingSessionIdsAtStart: options.existingSessionIdsAtStart,
        }),
        applySessions: options.applySessions,
        scheduleRetry: options.scheduleRetry,
        onIgnoredEmptySnapshot: options.onIgnoredEmptySnapshot,
    });

    options.log(
        `📥 fetchSessions completed - received ${snapshot.rawSessionIds.length}, processed ${snapshot.decryptedSessions.length}, retained ${appliedSnapshot.reconciledSessions.length} sessions`,
    );
    return appliedSnapshot;
}
