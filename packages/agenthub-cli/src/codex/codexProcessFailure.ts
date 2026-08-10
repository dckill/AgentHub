export type CodexProcessFailureOptions = {
    currentProcess: object | null;
    process: object;
    currentEpoch: number;
    epoch: number;
    intentionalDisconnectEpoch: number | null;
    processFailureReportedEpoch: number | null;
    error: Error;
    markReported: () => void;
    rejectPending: (epoch: number, error: Error) => void;
    resolvePendingTurn: (aborted: true, reason: 'backend-failure') => void;
    onFatalError?: (error: Error) => void;
    onFatalErrorFailure?: (error: unknown) => void;
};

/**
 * Apply the once-per-process-generation failure policy for app-server exits.
 *
 * Process events can arrive after a reconnect or after an intentional
 * disconnect. Those events must not settle requests or turns belonging to the
 * current generation, and a fatal callback must never escape the event path.
 */
export function reportCodexProcessFailure({
    currentProcess,
    process,
    currentEpoch,
    epoch,
    intentionalDisconnectEpoch,
    processFailureReportedEpoch,
    error,
    markReported,
    rejectPending,
    resolvePendingTurn,
    onFatalError,
    onFatalErrorFailure,
}: CodexProcessFailureOptions): boolean {
    if (currentProcess !== process || currentEpoch !== epoch) {
        return false;
    }
    if (intentionalDisconnectEpoch === epoch || processFailureReportedEpoch === epoch) {
        return false;
    }

    markReported();
    rejectPending(epoch, error);
    resolvePendingTurn(true, 'backend-failure');

    try {
        onFatalError?.(error);
    } catch (handlerError) {
        onFatalErrorFailure?.(handlerError);
    }
    return true;
}
