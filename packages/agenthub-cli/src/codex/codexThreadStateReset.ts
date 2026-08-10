export interface ClearCodexThreadStateOptions {
    threadId: string | null;
    turnId: string | null;
    resolvePendingTurn: (aborted: true, reason: 'interrupt') => void;
    setThreadId: (threadId: null) => void;
    setTurnId: (turnId: null) => void;
    setThreadDefaults: (defaults: null) => void;
    completedTurnIds: Set<string>;
    disconnectedTurnIds: Set<string>;
    recoveredTurnIds: Set<string>;
    rawFileChangesByItemId: Map<string, unknown>;
    onLog?: (threadId: string, turnId: string) => void;
}

/** Clear all state scoped to the current Codex thread after settling its turn. */
export function clearCodexThreadState(options: ClearCodexThreadStateOptions): void {
    options.onLog?.(options.threadId ?? 'none', options.turnId ?? 'none');
    options.resolvePendingTurn(true, 'interrupt');
    options.setThreadId(null);
    options.setTurnId(null);
    options.setThreadDefaults(null);
    options.completedTurnIds.clear();
    options.disconnectedTurnIds.clear();
    options.recoveredTurnIds.clear();
    options.rawFileChangesByItemId.clear();
}
