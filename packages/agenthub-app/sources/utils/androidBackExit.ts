export const DOUBLE_BACK_EXIT_TIMEOUT_MS = 2000;

export function getAndroidBackExitDecision(
    nowMs: number,
    lastBackPressAtMs: number | null,
    timeoutMs: number = DOUBLE_BACK_EXIT_TIMEOUT_MS,
): { shouldExit: boolean; nextBackPressAtMs: number | null } {
    if (lastBackPressAtMs !== null) {
        const elapsedMs = nowMs - lastBackPressAtMs;
        if (elapsedMs >= 0 && elapsedMs <= timeoutMs) {
            return { shouldExit: true, nextBackPressAtMs: null };
        }
    }

    return { shouldExit: false, nextBackPressAtMs: nowMs };
}
