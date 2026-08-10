import type { Session } from './storageTypes';
import type { SessionSnapshotApplicationResult } from './sessionSnapshotApplication';

export interface ApplySessionSnapshotSyncOptions {
    snapshot: SessionSnapshotApplicationResult;
    applySessions: (sessions: Array<Omit<Session, 'presence'> & { presence?: Session['presence'] }>, persist: boolean) => void;
    scheduleRetry: () => void;
    onIgnoredEmptySnapshot: () => void;
}

/** Apply a decrypted session snapshot while preserving empty-snapshot and retry semantics. */
export function applySessionSnapshotSync(
    options: ApplySessionSnapshotSyncOptions,
): SessionSnapshotApplicationResult {
    if (options.snapshot.ignoredEmptySnapshot) {
        options.onIgnoredEmptySnapshot();
    }

    options.applySessions(options.snapshot.reconciledSessions, true);
    if (options.snapshot.shouldRetry) {
        options.scheduleRetry();
    }

    return options.snapshot;
}
