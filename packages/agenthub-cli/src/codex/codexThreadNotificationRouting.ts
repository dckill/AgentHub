export type CodexThreadNotificationRoute =
    | { kind: 'status'; statusType: unknown }
    | { kind: 'goal-updated'; threadId?: string; turnId: string | null; goal: unknown }
    | { kind: 'goal-cleared'; threadId?: string }
    | { kind: 'token-usage'; tokenUsage: Record<string, unknown> | null }
    | { kind: 'ignored' };

function asRecord(value: unknown): Record<string, unknown> | null {
    return value !== null && typeof value === 'object'
        ? value as Record<string, unknown>
        : null;
}

/** Normalize thread-level notifications without touching client state. */
export function classifyCodexThreadNotification(
    method: string,
    params: unknown,
): CodexThreadNotificationRoute {
    const value = asRecord(params);

    if (method === 'thread/status/changed') {
        const status = asRecord(value?.status);
        return { kind: 'status', statusType: status?.type };
    }

    if (method === 'thread/goal/updated') {
        const goal = value?.goal;
        const goalRecord = asRecord(goal);
        const threadId = typeof value?.threadId === 'string'
            ? value.threadId
            : (typeof goalRecord?.threadId === 'string' ? goalRecord.threadId : undefined);
        const turnId = typeof value?.turnId === 'string' ? value.turnId : null;
        return { kind: 'goal-updated', ...(threadId ? { threadId } : {}), turnId, goal };
    }

    if (method === 'thread/goal/cleared') {
        const threadId = typeof value?.threadId === 'string' ? value.threadId : undefined;
        return { kind: 'goal-cleared', ...(threadId ? { threadId } : {}) };
    }

    if (method === 'thread/tokenUsage/updated') {
        const tokenUsage = asRecord(value?.tokenUsage);
        return { kind: 'token-usage', tokenUsage };
    }

    return { kind: 'ignored' };
}
