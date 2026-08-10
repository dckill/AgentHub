export type NewSessionRealtimeHandlerParams = {
    ensureSessionLoaded: () => Promise<unknown>;
    assertCurrent: () => void;
    onError: (error: unknown) => void;
};

/** Load a realtime-created session and recover through the authoritative sync on failure. */
export async function handleNewSessionRealtimeUpdate(
    params: NewSessionRealtimeHandlerParams,
): Promise<void> {
    try {
        await params.ensureSessionLoaded();
    } catch (error) {
        // A stale account must fail before scheduling an invalidation on the new account.
        params.assertCurrent();
        params.onError(error);
    }
}
