export type CodexRawFileChanges = Record<string, Record<string, unknown>>;

export type CodexRawItemRoute =
    | {
        kind: 'command-start';
        callId: string;
        command: unknown;
        cwd: unknown;
        description: unknown;
    }
    | {
        kind: 'command-complete';
        callId: string;
        output: unknown;
        exitCode: unknown;
        durationMs: unknown;
        status: unknown;
        cwd: unknown;
        command: unknown;
    }
    | {
        kind: 'file-start';
        callId: string;
        changes: CodexRawFileChanges;
    }
    | {
        kind: 'file-complete';
        callId: string;
        status: unknown;
        clearChanges: boolean;
    }
    | {
        kind: 'agent-message';
        itemId: unknown;
        text: string;
        phase: unknown;
        isFinalAnswer: boolean;
    }
    | { kind: 'ignored' };

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

export function normalizeCodexRawFileChangeList(changes: unknown): CodexRawFileChanges | undefined {
    if (!Array.isArray(changes)) {
        return undefined;
    }

    const normalized: CodexRawFileChanges = {};
    for (const rawChange of changes) {
        const change = asRecord(rawChange);
        if (!change) {
            continue;
        }
        const path = typeof change?.path === 'string' ? change.path : null;
        if (!path) {
            continue;
        }

        const entry: Record<string, unknown> = {};
        if (typeof change.diff === 'string') {
            entry.diff = change.diff;
        }
        const kind = asRecord(change.kind);
        if (kind) {
            entry.kind = kind;
        }
        normalized[path] = entry;
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function classifyCodexRawItem(method: string, rawItem: unknown): CodexRawItemRoute {
    const item = asRecord(rawItem);
    if (!item || !method.startsWith('item/')) {
        return { kind: 'ignored' };
    }

    const type = item.type;
    const callId = typeof item.id === 'string' ? item.id : '';

    if (type === 'commandExecution') {
        if (method === 'item/started') {
            return {
                kind: 'command-start',
                callId,
                command: item.command,
                cwd: item.cwd,
                description: item.command,
            };
        }
        if (method === 'item/completed') {
            return {
                kind: 'command-complete',
                callId,
                output: item.aggregatedOutput ?? '',
                exitCode: item.exitCode ?? null,
                durationMs: item.durationMs ?? null,
                status: item.status,
                cwd: item.cwd,
                command: item.command,
            };
        }
        return { kind: 'ignored' };
    }

    if (type === 'fileChange') {
        if (method === 'item/started') {
            return {
                kind: 'file-start',
                callId,
                changes: normalizeCodexRawFileChangeList(item.changes) ?? {},
            };
        }
        if (method === 'item/completed') {
            return {
                kind: 'file-complete',
                callId,
                status: item.status,
                clearChanges: item.status === 'completed'
                    || item.status === 'failed'
                    || item.status === 'declined',
            };
        }
        return { kind: 'ignored' };
    }

    if (method === 'item/completed' && type === 'agentMessage') {
        const text = typeof item.text === 'string' ? item.text : '';
        return {
            kind: 'agent-message',
            itemId: item.id,
            text,
            phase: item.phase,
            isFinalAnswer: item.phase === 'final_answer',
        };
    }

    return { kind: 'ignored' };
}
