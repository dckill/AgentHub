type TimerHandle = ReturnType<typeof setInterval>;

export const SOCKET_AUTH_REVALIDATION_INTERVAL_MS = 15_000;

export function startSocketAuthRevalidation({
    token,
    verifyToken,
    disconnect,
    intervalMs = SOCKET_AUTH_REVALIDATION_INTERVAL_MS,
    setInterval: schedule = setInterval,
    clearInterval: clear = clearInterval,
}: {
    token: string;
    verifyToken: (token: string) => Promise<unknown>;
    disconnect: (close: boolean) => void;
    intervalMs?: number;
    setInterval?: (callback: () => void, intervalMs: number) => TimerHandle;
    clearInterval?: (handle: TimerHandle) => void;
}): () => void {
    let stopped = false;
    let timer: TimerHandle | undefined;
    const stop = () => {
        if (stopped) return;
        stopped = true;
        if (timer !== undefined) {
            clear(timer);
        }
    };
    const check = async () => {
        if (stopped) return;
        try {
            const verified = await verifyToken(token);
            if (!verified && !stopped) {
                stop();
                disconnect(true);
            }
        } catch {
            if (!stopped) {
                stop();
                disconnect(true);
            }
        }
    };

    timer = schedule(() => {
        void check();
    }, intervalMs);

    return stop;
}
