export type ClaudeBackendFailureAction = 'retry' | 'exit';

export async function handleClaudeBackendFailure({
    error,
    exitRequested,
    onBackendFatal,
    notifyUnexpected,
}: {
    error: unknown;
    exitRequested: boolean;
    onBackendFatal?: (error: unknown) => void | Promise<void>;
    notifyUnexpected?: (error: unknown) => void;
}): Promise<ClaudeBackendFailureAction> {
    // A signal/archive request already owns the terminal path. Do not invoke
    // provider cleanup a second time from a late SDK rejection.
    if (exitRequested) {
        return 'exit';
    }

    if (onBackendFatal) {
        try {
            await onBackendFatal(error);
        } catch (shutdownError) {
            // The session shutdown coordinator is best-effort, but a provider
            // process failure must still terminate the launcher rather than
            // looping forever. Preserve the diagnostic for the runner log.
            notifyUnexpected?.(shutdownError);
        }
        return 'exit';
    }

    // Keep the historical retry behavior for callers that do not provide a
    // terminal handler (for example standalone local launcher usage).
    notifyUnexpected?.(error);
    return 'retry';
}
