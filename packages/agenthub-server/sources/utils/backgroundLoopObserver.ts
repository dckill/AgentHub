type LoopLabels = { loop: string };

export type BackgroundLoopObserver = {
    onFailure: (name: string, error: unknown, consecutiveFailures: number) => void;
    onSuccess: (name: string) => void;
};

export function createBackgroundLoopObserver({
    failures,
    consecutive,
}: {
    failures: { inc: (labels: LoopLabels) => void };
    consecutive: { set: (labels: LoopLabels, value: number) => void };
}): BackgroundLoopObserver {
    return {
        onFailure: (name, _error, consecutiveFailures) => {
            failures.inc({ loop: name });
            consecutive.set({ loop: name }, consecutiveFailures);
        },
        onSuccess: (name) => {
            consecutive.set({ loop: name }, 0);
        },
    };
}
