export type CodexRawNotificationKind =
    | 'turn-started'
    | 'turn-completed'
    | 'thread-status'
    | 'thread-goal-updated'
    | 'thread-goal-cleared'
    | 'token-usage'
    | 'item';

/** Classify raw app-server notifications without touching client state. */
export function classifyCodexRawNotification(method: string): CodexRawNotificationKind | null {
    if (method === 'turn/started') return 'turn-started';
    if (method === 'turn/completed') return 'turn-completed';
    if (method === 'thread/status/changed') return 'thread-status';
    if (method === 'thread/goal/updated') return 'thread-goal-updated';
    if (method === 'thread/goal/cleared') return 'thread-goal-cleared';
    if (method === 'thread/tokenUsage/updated') return 'token-usage';
    if (method === 'thread/started' || method.startsWith('item/')) return 'item';
    return null;
}

export function extractCodexTurnId(params: unknown): string | null {
    if (!params || typeof params !== 'object') return null;
    const value = params as {
        turn?: { id?: unknown } | null;
        turnId?: unknown;
        turn_id?: unknown;
    };
    const turnId = value.turn?.id ?? value.turnId ?? value.turn_id ?? null;
    return typeof turnId === 'string' && turnId.length > 0 ? turnId : null;
}

export function extractCodexTurnStatus(params: unknown): string | null {
    if (!params || typeof params !== 'object') return null;
    const value = params as { turn?: { status?: unknown } | null; status?: unknown };
    const status = value.turn?.status ?? value.status ?? null;
    return typeof status === 'string' && status.length > 0 ? status : null;
}
