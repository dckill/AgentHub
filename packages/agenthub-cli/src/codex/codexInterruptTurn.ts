export interface InterruptCodexTurnOptions {
    threadId: string | null | undefined;
    turnId: string | null | undefined;
    request: (params: { threadId: string; turnId: string }) => Promise<unknown>;
    onError?: (error: unknown) => void;
    onFinally: () => void;
}

/** Issue a best-effort turn interrupt and settle the caller's pending marker. */
export async function interruptCodexTurn(options: InterruptCodexTurnOptions): Promise<void> {
    if (!options.threadId || !options.turnId) {
        return;
    }

    try {
        await options.request({ threadId: options.threadId, turnId: options.turnId });
    } catch (error) {
        options.onError?.(error);
    } finally {
        options.onFinally();
    }
}
