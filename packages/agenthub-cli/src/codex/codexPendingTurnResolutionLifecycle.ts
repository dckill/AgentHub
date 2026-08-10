import { shouldResolvePendingTurn } from './pendingTurnResolution';

export type CodexPendingTurnResolutionLifecycleParams = {
    pendingTurnId?: string | null;
    notificationTurnId: string | null;
    aborted: boolean;
    source: string;
    resolve: (aborted: boolean, reason?: 'timeout' | 'interrupt' | 'backend-failure') => void;
    logStale: (source: string, notificationTurnId: string | null, pendingTurnId: string | null) => void;
};

/** Resolve only the currently awaited turn; explicit mismatches are stale. */
export function resolveCodexPendingTurnLifecycle(
    params: CodexPendingTurnResolutionLifecycleParams,
): boolean {
    if (params.pendingTurnId === undefined) return false;

    const pendingTurnId = params.pendingTurnId ?? null;
    if (!shouldResolvePendingTurn({
        pendingTurnId,
        notificationTurnId: params.notificationTurnId,
    })) {
        params.logStale(params.source, params.notificationTurnId, pendingTurnId);
        return false;
    }

    params.resolve(params.aborted, params.aborted ? 'interrupt' : undefined);
    return true;
}
