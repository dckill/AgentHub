type TimerHandle = ReturnType<typeof setTimeout>;

type Closeable = { close: () => void };
type ProcessLike = {
    stdin?: { end: () => void } | null;
    kill: (signal?: NodeJS.Signals | number) => void;
};

export function terminateCodexProcess({
    readline,
    proc,
    pid,
    forceKillDelayMs = 2_000,
    schedule = setTimeout,
    killProcess = process.kill,
}: {
    readline?: Closeable | null;
    proc?: ProcessLike | null;
    pid?: number;
    forceKillDelayMs?: number;
    schedule?: (callback: () => void, delayMs: number) => TimerHandle;
    killProcess?: (pid: number, signal?: NodeJS.Signals | number) => void;
}): void {
    readline?.close();

    try {
        proc?.stdin?.end();
        proc?.kill('SIGTERM');
    } catch {
        // Process may have exited between stdin close and SIGTERM.
    }

    if (pid) {
        const killTimer = schedule(() => {
            try {
                killProcess(pid, 0);
                killProcess(pid, 'SIGKILL');
            } catch {
                // The process is already gone or cannot be signalled.
            }
        }, forceKillDelayMs);
        killTimer.unref?.();
    }
}
