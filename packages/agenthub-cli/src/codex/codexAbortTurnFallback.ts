import type { EventMsg } from './codexAppServerTypes';

export type CodexAbortTurnFallbackResult = {
    hadActiveTurn: boolean;
    aborted: boolean;
    forcedRestart: boolean;
    resumedThread: boolean;
};

export interface AbortCodexTurnWithFallbackOptions {
    hasActiveTurn: () => boolean;
    interrupt: () => Promise<void>;
    waitForCompletion: (gracePeriodMs: number) => Promise<boolean>;
    defaultGracePeriodMs: number;
    gracePeriodMs?: number;
    forceRestartOnTimeout?: boolean;
    getPendingTurnId: () => string | null;
    reconnectAndResumeThread: () => Promise<boolean>;
    isRecoveredTurn: (turnId: string) => boolean;
    emitEvent: (event: EventMsg) => void;
    onForceRestart?: (gracePeriodMs: number) => void;
}

/** Orchestrate interrupt, grace-period waiting, and optional process recovery. */
export async function abortCodexTurnWithFallback(
    options: AbortCodexTurnWithFallbackOptions,
): Promise<CodexAbortTurnFallbackResult> {
    const hadActiveTurn = options.hasActiveTurn();
    if (!hadActiveTurn) {
        return { hadActiveTurn: false, aborted: false, forcedRestart: false, resumedThread: false };
    }

    await options.interrupt();

    const gracePeriodMs = options.gracePeriodMs ?? options.defaultGracePeriodMs;
    if (await options.waitForCompletion(gracePeriodMs)) {
        return { hadActiveTurn: true, aborted: true, forcedRestart: false, resumedThread: false };
    }

    const shouldForceRestart = options.forceRestartOnTimeout ?? true;
    if (!shouldForceRestart) {
        return { hadActiveTurn: true, aborted: false, forcedRestart: false, resumedThread: false };
    }

    options.onForceRestart?.(gracePeriodMs);
    const pendingTurnId = options.getPendingTurnId();
    const resumedThread = await options.reconnectAndResumeThread();
    if (pendingTurnId && !options.isRecoveredTurn(pendingTurnId)) {
        options.emitEvent({
            type: 'turn_aborted',
            reason: 'interrupted',
            turn_id: pendingTurnId,
            forced_restart: true,
        });
    }

    return { hadActiveTurn: true, aborted: true, forcedRestart: true, resumedThread };
}
