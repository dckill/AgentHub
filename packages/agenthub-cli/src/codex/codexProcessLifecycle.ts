export interface CodexProcessStream {
    on: (event: string, listener: (...args: any[]) => void) => unknown;
}

export interface CodexProcessLike {
    on: (event: string, listener: (...args: any[]) => void) => unknown;
    stdout?: CodexProcessStream | null;
    stderr?: CodexProcessStream | null;
}

export interface CodexReadlineLike {
    on: (event: string, listener: (...args: any[]) => void) => unknown;
}

export interface AttachCodexProcessLifecycleOptions<TReadline extends CodexReadlineLike> {
    proc: CodexProcessLike;
    epoch: number;
    isCurrent: () => boolean;
    createReadline: (stdout: CodexProcessStream) => TReadline;
    onProcessError: (error: unknown) => void;
    onProcessExit: (code: number | null, signal: NodeJS.Signals | null) => void;
    onStaleExit?: () => void;
    onStderr: (text: string) => void;
    onLine: (line: string, epoch: number) => void;
}

/** Attach generation-aware app-server process and stdio listeners. */
export function attachCodexProcessLifecycle<TReadline extends CodexReadlineLike>(
    options: AttachCodexProcessLifecycleOptions<TReadline>,
): TReadline {
    options.proc.on('error', (error) => {
        options.onProcessError(error);
    });

    options.proc.on('exit', (code: number | null, signal: NodeJS.Signals | null) => {
        if (!options.isCurrent()) {
            options.onStaleExit?.();
            return;
        }
        options.onProcessExit(code, signal);
    });

    options.proc.stderr?.on('data', (chunk: unknown) => {
        if (!options.isCurrent()) return;
        const text = (typeof chunk === 'string' ? chunk : String(chunk)).trim();
        if (text) options.onStderr(text);
    });

    const readline = options.createReadline(options.proc.stdout!);
    readline.on('line', (line: string) => {
        if (!options.isCurrent()) return;
        options.onLine(line, options.epoch);
    });
    return readline;
}
