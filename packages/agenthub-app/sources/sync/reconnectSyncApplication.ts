export type ReconnectSyncPlan = {
    refreshSessions: boolean;
    refreshMachines: boolean;
    refreshArtifacts: boolean;
    retryPendingSends: boolean;
};

/** Decide which account synchronizers may run after a socket reconnect. */
export function planReconnectSync(isCurrentAccount: boolean): ReconnectSyncPlan {
    if (!isCurrentAccount) {
        return {
            refreshSessions: false,
            refreshMachines: false,
            refreshArtifacts: false,
            retryPendingSends: false,
        };
    }

    return {
        refreshSessions: true,
        refreshMachines: true,
        refreshArtifacts: true,
        retryPendingSends: true,
    };
}

/** Apply the reconnect plan while keeping account-generation gating outside Sync's socket wiring. */
export function runReconnectSyncApplication({
    isCurrentAccount,
    invalidateSessions,
    invalidateMachines,
    invalidateArtifacts,
    retryPendingSends,
}: {
    isCurrentAccount: boolean;
    invalidateSessions: () => void;
    invalidateMachines: () => void;
    invalidateArtifacts: () => void;
    retryPendingSends: () => void;
}): boolean {
    const plan = planReconnectSync(isCurrentAccount);
    if (!plan.refreshSessions) {
        return false;
    }
    if (plan.refreshSessions) invalidateSessions();
    if (plan.refreshMachines) invalidateMachines();
    if (plan.refreshArtifacts) invalidateArtifacts();
    if (plan.retryPendingSends) retryPendingSends();
    return true;
}
