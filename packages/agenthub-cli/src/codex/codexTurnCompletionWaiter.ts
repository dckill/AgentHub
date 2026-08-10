export type TurnCompletionResult = {
    aborted: boolean;
    reason?: 'timeout' | 'interrupt' | 'backend-failure';
};

export function createCodexTurnCompletionWaiter(params: {
    timeoutMs: number;
    onTimeout: () => void;
}): {
    completion: Promise<TurnCompletionResult>;
    resolve: (result: TurnCompletionResult) => void;
    clear: () => void;
} {
    let resolveCompletion!: (result: TurnCompletionResult) => void;
    let timer: ReturnType<typeof setTimeout> | null = setTimeout(() => {
        timer = null;
        params.onTimeout();
    }, Math.max(0, params.timeoutMs));

    const completion = new Promise<TurnCompletionResult>((resolve) => {
        resolveCompletion = resolve;
    });

    return {
        completion,
        resolve: (result) => resolveCompletion(result),
        clear: () => {
            if (timer === null) return;
            clearTimeout(timer);
            timer = null;
        },
    };
}
