type ToolState = 'running' | 'completed' | 'error';

export interface TerminalResultInput {
    state: ToolState;
    result?: unknown;
    startedAt: number | null;
    completedAt: number | null;
}

export interface ParsedTerminalResult {
    stdout: string | null;
    stderr: string | null;
    error: string | null;
    exitCode: number | null;
    durationMs: number | null;
}

function valueToString(value: unknown, depth = 0): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
        const parts = value
            .map((item) => valueToString(item, depth + 1))
            .filter((item): item is string => !!item);
        return parts.length > 0 ? parts.join('') : null;
    }
    if (value && typeof value === 'object' && depth < 2) {
        return stringField(value as Record<string, unknown>, ['stdout', 'output', 'aggregatedOutput', 'text', 'content', 'data'], depth + 1);
    }
    return null;
}

function stringField(source: Record<string, unknown>, keys: string[], depth = 0): string | null {
    for (const key of keys) {
        const value = valueToString(source[key], depth);
        if (typeof value === 'string') return value;
    }
    return null;
}

function numberField(source: Record<string, unknown>, keys: string[]): number | null {
    for (const key of keys) {
        const value = source[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
    }
    return null;
}

function durationMs(startedAt: number | null, completedAt: number | null): number | null {
    if (typeof startedAt !== 'number' || typeof completedAt !== 'number') return null;
    const duration = completedAt - startedAt;
    return Number.isFinite(duration) && duration >= 0 ? duration : null;
}

export function parseBashToolResult(input: TerminalResultInput): ParsedTerminalResult {
    const { state, result } = input;
    const elapsed = durationMs(input.startedAt, input.completedAt);

    if (typeof result === 'string') {
        return {
            stdout: state === 'completed' ? result : null,
            stderr: null,
            error: state === 'error' ? result : null,
            exitCode: null,
            durationMs: elapsed,
        };
    }

    if (result && typeof result === 'object') {
        const record = result as Record<string, unknown>;
        const nestedOutput = record.output && typeof record.output === 'object' && !Array.isArray(record.output)
            ? record.output as Record<string, unknown>
            : null;
        const candidates = nestedOutput ? [record, nestedOutput] : [record];
        const firstString = (keys: string[]) => {
            for (const candidate of candidates) {
                const value = stringField(candidate, keys);
                if (value !== null) return value;
            }
            return null;
        };
        const firstNumber = (keys: string[]) => {
            for (const candidate of candidates) {
                const value = numberField(candidate, keys);
                if (value !== null) return value;
            }
            return null;
        };
        return {
            stdout: firstString(['stdout', 'output', 'aggregatedOutput', 'text', 'content']),
            stderr: firstString(['stderr']),
            error: firstString(['error', 'message']),
            exitCode: firstNumber(['exitCode', 'exit_code', 'code']),
            durationMs: firstNumber(['durationMs', 'duration_ms', 'elapsedMs']) ?? elapsed,
        };
    }

    return {
        stdout: null,
        stderr: null,
        error: null,
        exitCode: null,
        durationMs: elapsed,
    };
}

export function truncateTerminalOutput(value: string | null | undefined, maxLength = 1200): string | null {
    if (!value) return null;
    if (value.length <= maxLength) return value;
    return `${value.slice(0, maxLength)}...`;
}
