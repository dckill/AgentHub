import { createCodexTurnCompletionWaiter, type TurnCompletionResult } from './codexTurnCompletionWaiter';

export type RunCodexSendTurnAndWaitParams = {
    pendingInterrupt: Promise<void> | null;
    timeoutMs: number;
    setPendingTurn: (resolve: (result: TurnCompletionResult) => void) => void;
    clearPendingTurn: () => void;
    resolveOnTimeout: () => void;
    sendTurn: () => Promise<void>;
};

/** Own the send-and-wait lifecycle while leaving turn state storage in the client. */
export async function runCodexSendTurnAndWait(
    params: RunCodexSendTurnAndWaitParams,
): Promise<TurnCompletionResult> {
    if (params.pendingInterrupt) {
        await params.pendingInterrupt;
        await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const waiter = createCodexTurnCompletionWaiter({
        timeoutMs: params.timeoutMs,
        onTimeout: params.resolveOnTimeout,
    });
    params.setPendingTurn(waiter.resolve);

    try {
        await params.sendTurn();
    } catch (error) {
        waiter.clear();
        params.clearPendingTurn();
        throw error;
    }

    const result = await waiter.completion;
    waiter.clear();
    return result;
}
