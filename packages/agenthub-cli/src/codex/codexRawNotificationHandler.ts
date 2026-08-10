import type { EventMsg } from './codexAppServerTypes';
import { classifyCodexRawNotification, extractCodexTurnId, extractCodexTurnStatus } from './codexNotificationRouting';
import { classifyCodexRawItem, type CodexRawFileChanges } from './codexRawItemRouting';
import { classifyCodexThreadNotification } from './codexThreadNotificationRouting';

export type CodexRawNotificationProtocol = 'unknown' | 'legacy' | 'raw';

export type HandleCodexRawNotificationParams = {
    method: string;
    params: any;
    getProtocol: () => CodexRawNotificationProtocol;
    setProtocol: (protocol: CodexRawNotificationProtocol) => void;
    getTurnId: () => string | null;
    setTurnId: (turnId: string | null) => void;
    hasPendingTurn: () => boolean;
    markPendingTurnStarted: (turnId: string | null) => void;
    emitRawTurnCompletion: (turnId: string | null, status: string | null, error: unknown, source: string) => void;
    rawFileChangesByItemId: Map<string, CodexRawFileChanges>;
    emit: (event: EventMsg) => void;
};

/** Route raw app-server notifications while keeping client-owned state behind callbacks. */
export function handleCodexRawNotification(params: HandleCodexRawNotificationParams): boolean {
    if (classifyCodexRawNotification(params.method) === null) {
        return false;
    }

    if (params.getProtocol() === 'unknown') {
        params.setProtocol('raw');
    }

    if (params.method === 'turn/started') {
        const turnId = extractCodexTurnId(params.params);
        if (turnId) {
            params.setTurnId(turnId);
        }
        params.markPendingTurnStarted(turnId);
        params.emit({ type: 'task_started', ...(turnId ? { turn_id: turnId } : {}) });
        return true;
    }

    if (params.method === 'turn/completed') {
        params.emitRawTurnCompletion(
            extractCodexTurnId(params.params),
            extractCodexTurnStatus(params.params),
            params.params?.turn?.error ?? params.params?.error,
            params.method,
        );
        return true;
    }

    const threadRoute = classifyCodexThreadNotification(params.method, params.params);
    if (threadRoute.kind !== 'ignored') {
        switch (threadRoute.kind) {
            case 'status':
                if (threadRoute.statusType === 'idle' && params.hasPendingTurn()) {
                    params.emitRawTurnCompletion(params.getTurnId(), 'completed', null, params.method);
                }
                return true;
            case 'goal-updated':
                params.emit({
                    type: 'thread_goal_updated',
                    ...(threadRoute.threadId ? { thread_id: threadRoute.threadId, threadId: threadRoute.threadId } : {}),
                    ...(threadRoute.turnId ? { turn_id: threadRoute.turnId, turnId: threadRoute.turnId } : {}),
                    goal: threadRoute.goal,
                });
                return true;
            case 'goal-cleared':
                params.emit({
                    type: 'thread_goal_cleared',
                    ...(threadRoute.threadId ? { thread_id: threadRoute.threadId, threadId: threadRoute.threadId } : {}),
                });
                return true;
            case 'token-usage':
                if (threadRoute.tokenUsage) {
                    params.emit({ type: 'token_count', ...threadRoute.tokenUsage });
                }
                return true;
        }
    }

    const item = params.params?.item;
    if (!item || typeof item !== 'object') {
        return params.method.startsWith('item/');
    }

    const itemRoute = classifyCodexRawItem(params.method, item);
    switch (itemRoute.kind) {
        case 'command-start':
            params.emit({
                type: 'exec_command_begin',
                call_id: itemRoute.callId,
                callId: itemRoute.callId,
                command: itemRoute.command,
                cwd: itemRoute.cwd,
                description: itemRoute.description,
            });
            return true;
        case 'command-complete':
            params.emit({
                type: 'exec_command_end',
                call_id: itemRoute.callId,
                callId: itemRoute.callId,
                output: itemRoute.output,
                exit_code: itemRoute.exitCode,
                duration_ms: itemRoute.durationMs,
                status: itemRoute.status,
                cwd: itemRoute.cwd,
                command: itemRoute.command,
            });
            return true;
        case 'file-start':
            if (itemRoute.callId && Object.keys(itemRoute.changes).length > 0) {
                params.rawFileChangesByItemId.set(itemRoute.callId, itemRoute.changes);
            }
            params.emit({
                type: 'patch_apply_begin',
                call_id: itemRoute.callId,
                callId: itemRoute.callId,
                changes: itemRoute.changes,
            });
            return true;
        case 'file-complete':
            params.emit({
                type: 'patch_apply_end',
                call_id: itemRoute.callId,
                callId: itemRoute.callId,
                status: itemRoute.status,
            });
            if (itemRoute.callId && itemRoute.clearChanges) {
                params.rawFileChangesByItemId.delete(itemRoute.callId);
            }
            return true;
        case 'agent-message':
            if (itemRoute.text.length > 0) {
                params.emit({
                    type: 'agent_message',
                    message: itemRoute.text,
                    item_id: itemRoute.itemId,
                    phase: itemRoute.phase,
                });
            }
            if (itemRoute.isFinalAnswer && params.hasPendingTurn()) {
                params.emitRawTurnCompletion(
                    extractCodexTurnId(params.params),
                    'completed',
                    null,
                    `${params.method}:final_answer`,
                );
            }
            return true;
        case 'ignored':
            return params.method.startsWith('item/');
    }
}
