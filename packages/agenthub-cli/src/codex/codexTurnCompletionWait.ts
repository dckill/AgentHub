export type WaitForCodexTurnCompletionParams = {
    hasPending: () => boolean;
    timeoutMs: number;
    now?: () => number;
    sleep?: (milliseconds: number) => Promise<void>;
};

/** Wait for an active turn to settle within the abort grace period. */
export async function waitForCodexTurnCompletion(
    params: WaitForCodexTurnCompletionParams,
): Promise<boolean> {
    if (!params.hasPending()) {
        return true;
    }

    const now = params.now ?? Date.now;
    const sleep = params.sleep ?? ((milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
    const deadline = now() + Math.max(0, params.timeoutMs);
    while (params.hasPending()) {
        if (now() >= deadline) {
            return false;
        }
        await sleep(25);
    }
    return true;
}
