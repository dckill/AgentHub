/** Builds a session update only when a lifecycle event changes thinking state. */
export function buildLifecycleThinkingSessionUpdate<T extends { thinking: boolean; thinkingAt: number }>(
    session: T | undefined,
    lifecycleThinkingState: boolean | null,
    thinkingAt: number,
): T | null {
    if (!session || lifecycleThinkingState === null || session.thinking === lifecycleThinkingState) {
        return null;
    }

    return {
        ...session,
        thinking: lifecycleThinkingState,
        thinkingAt,
    };
}
