type TimerHandle = ReturnType<typeof setTimeout>;

export type CodexPendingRequest = {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    method: string;
    epoch: number;
};

export function createCodexPendingRequest({
    method,
    epoch,
    timeoutMs,
    timeoutMessage = `${method} timed out after ${timeoutMs}ms`,
    resolve,
    reject,
    schedule = setTimeout,
    clearTimeout: clearTimer = globalThis.clearTimeout,
    remove = () => undefined,
}: {
    method: string;
    epoch: number;
    timeoutMs: number;
    timeoutMessage?: string;
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
    schedule?: (callback: () => void, delayMs: number) => TimerHandle;
    clearTimeout?: (timer: TimerHandle) => void;
    remove?: () => void;
}): CodexPendingRequest {
    let timer: TimerHandle;
    let settled = false;
    const settle = (callback: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimer(timer);
        callback();
    };

    timer = schedule(() => {
        settle(() => {
            remove();
            reject(new Error(timeoutMessage));
        });
    }, timeoutMs);

    return {
        method,
        epoch,
        resolve: (result) => settle(() => resolve(result)),
        reject: (error) => settle(() => reject(error)),
    };
}
