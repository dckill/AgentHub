export type CodexNotificationProtocol = 'unknown' | 'legacy' | 'raw';

export interface ProjectCodexDisconnectStateOptions {
    preserveThreadState?: boolean;
    pendingTurnId: string | null;
    disconnectedTurnIds: Set<string>;
    setTurnId: (turnId: null) => void;
    setNotificationProtocol: (protocol: CodexNotificationProtocol) => void;
    clearThreadState: () => void;
}

export interface ProjectedCodexDisconnectState {
    recordedDisconnectedTurn: boolean;
}

/**
 * Project the client state that must change after an app-server disconnect.
 * Thread identity/defaults survive only for reconnect/resume; transport state
 * and the active turn never survive the process generation that just ended.
 */
export function projectCodexDisconnectState(
    options: ProjectCodexDisconnectStateOptions,
): ProjectedCodexDisconnectState {
    const recordedDisconnectedTurn = Boolean(options.preserveThreadState && options.pendingTurnId);
    if (recordedDisconnectedTurn) {
        options.disconnectedTurnIds.add(options.pendingTurnId!);
    }

    options.setTurnId(null);
    options.setNotificationProtocol('unknown');
    if (!options.preserveThreadState) {
        options.clearThreadState();
    }

    return { recordedDisconnectedTurn };
}
