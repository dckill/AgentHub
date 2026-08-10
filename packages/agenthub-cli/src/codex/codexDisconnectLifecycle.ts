import { projectCodexDisconnectState, type CodexNotificationProtocol } from './codexDisconnectState';
import { rejectPendingCodexRequests } from './codexPendingRequestCleanup';
import type { PendingCodexRequest } from './codexResponseResolution';
import type { TurnCompletionResult } from './codexTurnCompletionWaiter';

type DisconnectProcess = {
    stdin?: { end: () => void } | null;
    kill: (signal?: NodeJS.Signals | number) => void;
};

type DisconnectReadline = { close: () => void };

export type CodexDisconnectLifecycleOptions = {
    preserveThreadState?: boolean;
    proc?: DisconnectProcess | null;
    readline?: DisconnectReadline | null;
    pid?: number;
    epoch: number;
    pendingTurnId: string | null;
    disconnectedTurnIds: Set<string>;
    pending: Map<number, PendingCodexRequest>;
    sandboxCleanup: (() => Promise<void>) | null;
    terminateProcess: () => void;
    setReadline: (readline: null) => void;
    setProcess: (process: null) => void;
    setConnected: (connected: false) => void;
    setSandboxCleanup: (cleanup: null) => void;
    setSandboxEnabled: (enabled: false) => void;
    setTurnId: (turnId: null) => void;
    setNotificationProtocol: (protocol: CodexNotificationProtocol) => void;
    clearThreadState: () => void;
    resolvePendingTurn: (aborted: true, reason: Extract<TurnCompletionResult['reason'], 'interrupt'>) => void;
    onSandboxCleanupError?: (error: unknown) => void;
};

/**
 * Complete one Codex app-server disconnect without owning client state.
 *
 * The order is deliberate: close the readline reference, terminate the
 * process, invalidate transport state, reject requests from this epoch,
 * settle the active turn, then await sandbox cleanup.
 */
export async function runCodexDisconnectLifecycle({
    preserveThreadState,
    proc: _proc,
    readline: _readline,
    pid: _pid,
    epoch,
    pendingTurnId,
    disconnectedTurnIds,
    pending,
    sandboxCleanup,
    terminateProcess,
    setReadline,
    setProcess,
    setConnected,
    setSandboxCleanup,
    setSandboxEnabled,
    setTurnId,
    setNotificationProtocol,
    clearThreadState,
    resolvePendingTurn,
    onSandboxCleanupError,
}: CodexDisconnectLifecycleOptions): Promise<void> {
    setReadline(null);
    terminateProcess();
    setProcess(null);
    setConnected(false);

    projectCodexDisconnectState({
        preserveThreadState,
        pendingTurnId,
        disconnectedTurnIds,
        setTurnId,
        setNotificationProtocol,
        clearThreadState,
    });

    rejectPendingCodexRequests(
        pending,
        epoch,
        (method) => new Error(`Codex process disconnected while waiting for ${method}`),
    );

    resolvePendingTurn(true, 'interrupt');

    if (sandboxCleanup) {
        try {
            await sandboxCleanup();
        } catch (error) {
            onSandboxCleanupError?.(error);
        }
        setSandboxCleanup(null);
    }
    setSandboxEnabled(false);
}
