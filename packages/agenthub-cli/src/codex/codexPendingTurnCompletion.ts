import type { TurnCompletionResult } from './codexTurnCompletionWaiter';

export type PendingCodexTurnCompletion = {
    resolve: (result: TurnCompletionResult) => void;
    turnId: string | null;
};

export type ResolveCodexPendingTurnParams = {
    pending: PendingCodexTurnCompletion | null;
    aborted: boolean;
    reason?: TurnCompletionResult['reason'];
    cancelApprovals: () => void;
    clearPending: () => void;
};

/** Resolve the active turn once and release the client's pending slot. */
export function resolveCodexPendingTurn(params: ResolveCodexPendingTurnParams): boolean {
    if (params.aborted) {
        params.cancelApprovals();
    }
    if (!params.pending) {
        return false;
    }

    params.pending.resolve({
        aborted: params.aborted,
        ...(params.reason ? { reason: params.reason } : {}),
    });
    params.clearPending();
    return true;
}
