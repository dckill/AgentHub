type Cleanup = () => void;

export type ShutdownAccountOptions = {
    endAccount: Cleanup;
    removeAppStateListener: Cleanup;
    cancelStartupSyncs: Cleanup | null;
    clearStartupSyncs: Cleanup;
    stopAccountSyncs: Cleanup;
    stopBackgroundWatchdog: () => Promise<void>;
    failOutbox: Cleanup;
    clearMessageIngest: Cleanup;
    resetActivityAccumulator: Cleanup;
    clearSyncMaps: Cleanup;
    clearRetryGuards: Cleanup;
    clearPagination: Cleanup;
    clearMissingSessionRefreshes: Cleanup;
    clearDataKeys: Cleanup;
    clearEncryptionCache: Cleanup;
    resetPendingSettings: Cleanup;
    resetGitStatus: Cleanup;
    clearProjectManager: Cleanup;
    clearFileSearchCache: Cleanup;
    resetFileTransfers: Cleanup;
    resetSocket: Cleanup;
    resetStorage: Cleanup;
    clearCredentials: Cleanup;
};

export async function shutdownAccount(options: ShutdownAccountOptions): Promise<void> {
    options.endAccount();
    options.removeAppStateListener();
    options.cancelStartupSyncs?.();
    options.clearStartupSyncs();
    options.stopAccountSyncs();
    await options.stopBackgroundWatchdog();
    options.failOutbox();
    options.clearMessageIngest();
    options.resetActivityAccumulator();
    options.clearSyncMaps();
    options.clearRetryGuards();
    options.clearPagination();
    options.clearMissingSessionRefreshes();
    options.clearDataKeys();
    options.clearEncryptionCache();
    options.resetPendingSettings();
    options.resetGitStatus();
    options.clearProjectManager();
    options.clearFileSearchCache();
    options.resetFileTransfers();
    options.resetSocket();
    options.resetStorage();
    options.clearCredentials();
}
