type ToolState = 'running' | 'completed' | 'error';

export interface CodexBashResultInput {
    state: ToolState;
    result?: unknown;
    startedAt: number | null;
    completedAt: number | null;
}

export interface ParsedCodexBashResult {
    stdout: string | null;
    stderr: string | null;
    error: string | null;
    exitCode: number | null;
    durationMs: number | null;
}

function getStringField(source: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'string') {
            return value;
        }
    }
    return null;
}

function getNumberField(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) {
            return value;
        }
    }
    return null;
}

function getDurationMs(startedAt: number | null, completedAt: number | null): number | null {
    if (typeof startedAt !== 'number' || typeof completedAt !== 'number') {
        return null;
    }
    const duration = completedAt - startedAt;
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function parseCodexBashResult(input: CodexBashResultInput): ParsedCodexBashResult {
    const { state, result, startedAt, completedAt } = input;
    const durationMs = getDurationMs(startedAt, completedAt);

    if (typeof result === 'string') {
        return {
            stdout: state === 'completed' ? result : null,
            stderr: null,
            error: state === 'error' ? result : null,
            exitCode: null,
            durationMs,
        };
    }

    if (result && typeof result === 'object') {
        const record = result as Record<string, unknown>;
        const stdout = getStringField(record, ['stdout', 'output', 'text']);
        const stderr = getStringField(record, ['stderr']);
        const error = getStringField(record, ['error', 'message']);
        const exitCode = getNumberField(record, ['exitCode', 'exit_code', 'code', 'status']);

        return {
            stdout,
            stderr,
            error,
            exitCode,
            durationMs,
        };
    }

    return {
        stdout: null,
        stderr: null,
        error: null,
        exitCode: null,
        durationMs,
    };
}
