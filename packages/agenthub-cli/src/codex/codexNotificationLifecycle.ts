import type { EventMsg } from './codexAppServerTypes';
import { handleCodexLegacyNotification } from './codexLegacyNotificationHandler';
import { handleCodexLifecycleNotification } from './codexLifecycleNotification';
import { handleCodexRawNotification } from './codexRawNotificationHandler';
import type { CodexRawFileChanges } from './codexRawItemRouting';
import { routeCodexNotification, type CodexNotificationRoute } from './codexNotificationRouter';

export type CodexNotificationProtocol = 'unknown' | 'legacy' | 'raw';

export type CodexNotificationLifecycleParams = {
    method: string;
    params: any;
    getProtocol: () => CodexNotificationProtocol;
    setProtocol: (protocol: CodexNotificationProtocol) => void;
    getTurnId: () => string | null;
    setTurnId: (turnId: string | null) => void;
    hasPendingTurn: () => boolean;
    markPendingTurnStarted: (turnId?: string | null) => void;
    emitRawTurnCompletion: (
        turnId: string | null,
        status: string | null,
        error: unknown,
        source: string,
    ) => void;
    rememberCompletedTurnId: (turnId: string) => void;
    tryResolvePendingTurn: (aborted: boolean, turnId: string | null, source: string) => void;
    rawFileChangesByItemId: Map<string, CodexRawFileChanges>;
    emit: (event: EventMsg) => void;
    logLifecycle: (method: string) => void;
    logMcp: (params: any) => void;
    logUnhandled: (method: string) => void;
    logRaw: (method: string) => void;
};

/**
 * Route one app-server notification while keeping protocol state and event
 * side effects behind callbacks owned by CodexAppServerClient.
 */
export function handleCodexNotificationLifecycle(
    params: CodexNotificationLifecycleParams,
): CodexNotificationRoute {
    return routeCodexNotification({
        method: params.method,
        params: params.params,
        handleLegacy: () => handleCodexLegacyNotification({
            method: params.method,
            params: params.params,
            emitEvent: params.emit,
            setTurnId: params.setTurnId,
            markPendingTurnStarted: params.markPendingTurnStarted,
            rememberCompletedTurnId: params.rememberCompletedTurnId,
            tryResolvePendingTurn: params.tryResolvePendingTurn,
        }),
        handleRaw: () => handleCodexRawNotification({
            method: params.method,
            params: params.params,
            getProtocol: params.getProtocol,
            setProtocol: params.setProtocol,
            getTurnId: params.getTurnId,
            setTurnId: params.setTurnId,
            hasPendingTurn: params.hasPendingTurn,
            markPendingTurnStarted: params.markPendingTurnStarted,
            emitRawTurnCompletion: params.emitRawTurnCompletion,
            rawFileChangesByItemId: params.rawFileChangesByItemId,
            emit: params.emit,
        }),
        handleLifecycle: () => handleCodexLifecycleNotification({
            method: params.method,
            params: params.params,
            setTurnId: params.setTurnId,
            markPendingTurnStarted: params.markPendingTurnStarted,
            emitRawTurnCompletion: params.emitRawTurnCompletion,
            logLifecycle: params.logLifecycle,
            logMcp: params.logMcp,
            logUnhandled: params.logUnhandled,
        }),
        setLegacyProtocol: () => params.setProtocol('legacy'),
        logRaw: params.logRaw,
    });
}
