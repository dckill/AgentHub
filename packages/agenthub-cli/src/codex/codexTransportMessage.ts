/**
 * The small, state-free boundary between Codex app-server stdout and the
 * client state machine. Keeping line parsing here makes malformed transport
 * input fail closed without coupling JSON handling to turn or approval state.
 */

export type CodexTransportResponse = {
    kind: 'response';
    id: number;
    result?: unknown;
    error?: {
        code?: unknown;
        message?: unknown;
        data?: unknown;
    };
};

export type CodexTransportServerRequest = {
    kind: 'server-request';
    id: number;
    method: string;
    params?: unknown;
};

export type CodexTransportNotification = {
    kind: 'notification';
    method: string;
    params?: unknown;
};

export type ParsedCodexTransportLine =
    | { kind: 'empty' }
    | { kind: 'invalid-json' }
    | { kind: 'ignored' }
    | CodexTransportResponse
    | CodexTransportServerRequest
    | CodexTransportNotification;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

/** Parse one newline-delimited app-server message without mutating client state. */
export function parseCodexTransportLine(line: string): ParsedCodexTransportLine {
    if (!line.trim()) {
        return { kind: 'empty' };
    }

    let value: unknown;
    try {
        value = JSON.parse(line);
    } catch {
        return { kind: 'invalid-json' };
    }

    if (!isRecord(value)) {
        return { kind: 'ignored' };
    }

    const id = value.id;
    const method = value.method;

    if (typeof id === 'number' && Number.isFinite(id)) {
        if (hasOwn(value, 'result') || hasOwn(value, 'error')) {
            const response: CodexTransportResponse = {
                kind: 'response',
                id,
            };
            if (hasOwn(value, 'result')) {
                response.result = value.result;
            }
            if (isRecord(value.error)) {
                response.error = {
                    ...(hasOwn(value.error, 'code') ? { code: value.error.code } : {}),
                    ...(hasOwn(value.error, 'message') ? { message: value.error.message } : {}),
                    ...(hasOwn(value.error, 'data') ? { data: value.error.data } : {}),
                };
            }
            return response;
        }

        if (typeof method === 'string' && method.length > 0) {
            return {
                kind: 'server-request',
                id,
                method,
                ...(hasOwn(value, 'params') ? { params: value.params } : {}),
            };
        }
    }

    if (typeof method === 'string' && method.length > 0 && !hasOwn(value, 'id')) {
        return {
            kind: 'notification',
            method,
            ...(hasOwn(value, 'params') ? { params: value.params } : {}),
        };
    }

    return { kind: 'ignored' };
}
