export type StartupSyncTask = {
    name: string;
    run: () => void;
};

export type StartupSyncScheduler = (run: () => void, delayMs: number) => unknown;

export type StartupSyncOptions = {
    immediate: StartupSyncTask[];
    background: StartupSyncTask[];
    backgroundInitialDelayMs?: number;
    backgroundStaggerMs?: number;
    schedule?: StartupSyncScheduler;
    cancelScheduled?: (handle: unknown) => void;
    onBackgroundTaskError?: (name: string, error: unknown) => void;
};

const DEFAULT_BACKGROUND_INITIAL_DELAY_MS = 750;
const DEFAULT_BACKGROUND_STAGGER_MS = 250;

export function runStartupSyncs(options: StartupSyncOptions): () => void {
    const schedule = options.schedule ?? ((run, delayMs) => setTimeout(run, delayMs));
    const cancelScheduled = options.cancelScheduled ?? ((handle) => clearTimeout(handle as ReturnType<typeof setTimeout>));
    const initialDelayMs = options.backgroundInitialDelayMs ?? DEFAULT_BACKGROUND_INITIAL_DELAY_MS;
    const staggerMs = options.backgroundStaggerMs ?? DEFAULT_BACKGROUND_STAGGER_MS;
    const handles: unknown[] = [];
    let cancelled = false;

    for (const task of options.immediate) {
        task.run();
    }

    options.background.forEach((task, index) => {
        const handle = schedule(() => {
            if (cancelled) {
                return;
            }
            try {
                task.run();
            } catch (error) {
                options.onBackgroundTaskError?.(task.name, error);
            }
        }, initialDelayMs + index * staggerMs);
        handles.push(handle);
    });

    return () => {
        if (cancelled) {
            return;
        }
        cancelled = true;
        handles.forEach(handle => cancelScheduled(handle));
        handles.length = 0;
    };
}
