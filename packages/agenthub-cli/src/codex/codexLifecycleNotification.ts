import {
    extractCodexTurnId,
    extractCodexTurnStatus,
} from './codexNotificationRouting';

export type CodexLifecycleNotificationParams = {
    method: string;
    params: any;
    setTurnId: (turnId: string | null) => void;
    markPendingTurnStarted: (turnId?: string | null) => void;
    emitRawTurnCompletion: (
        turnId: string | null,
        status: string | null,
        error: unknown,
        source: string,
    ) => void;
    logLifecycle: (method: string) => void;
    logMcp: (params: any) => void;
    logUnhandled: (method: string) => void;
};

/** Handle v2 lifecycle/MCP notification fallbacks after legacy and raw routing. */
export function handleCodexLifecycleNotification(params: CodexLifecycleNotificationParams): boolean {
    const { method, params: payload } = params;
    if (method === 'thread/started' || method === 'turn/started'
        || method === 'turn/completed' || method === 'thread/status/changed') {
        params.logLifecycle(method);
        if (method === 'turn/started') {
            const turnId = extractCodexTurnId(payload);
            if (turnId) {
                params.setTurnId(turnId);
            }
            params.markPendingTurnStarted(turnId);
        }
        if (method === 'turn/completed') {
            params.emitRawTurnCompletion(
                extractCodexTurnId(payload),
                extractCodexTurnStatus(payload),
                payload?.turn?.error ?? payload?.error,
                method,
            );
        }
        return true;
    }

    if (method === 'mcpServer/startupStatus/updated') {
        params.logMcp(payload);
        return true;
    }

    params.logUnhandled(method);
    return false;
}
