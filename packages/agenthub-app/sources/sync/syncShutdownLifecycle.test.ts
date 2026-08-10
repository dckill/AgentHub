import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { shutdownAccount } from './syncShutdownLifecycle';

const syncPath = path.resolve(__dirname, './sync.ts');
const lifecyclePath = path.resolve(__dirname, './syncShutdownLifecycle.ts');
const syncSource = fs.readFileSync(syncPath, 'utf8');

describe('Sync shutdown lifecycle boundary', () => {
    it('owns account teardown ordering outside Sync', () => {
        expect(fs.existsSync(lifecyclePath)).toBe(true);
        const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

        expect(lifecycleSource).toContain('export async function shutdownAccount');
        expect(syncSource).toContain("import { shutdownAccount } from './syncShutdownLifecycle';");
        expect(syncSource).not.toContain('this.outbox.failAll();');
    });

    it('removes and can later re-register the AppState listener across account lifecycles', () => {
        expect(syncSource).toContain("import { subscribeAppStateListener } from './appStateSubscriptionLifecycle';");
        expect(syncSource).toContain('this.registerAppStateListener();');
        expect(syncSource).toContain('removeAppStateListener: () => {');
        expect(syncSource).toContain('this.removeAppStateListener = null;');
    });

    it('ends the account before stopping queues and clears credentials last', async () => {
        const events: string[] = [];
        const mark = (name: string) => vi.fn(() => { events.push(name); });
        const options = {
            endAccount: mark('end'),
            removeAppStateListener: mark('remove-app-state'),
            cancelStartupSyncs: mark('cancel-startup'),
            clearStartupSyncs: mark('clear-startup'),
            stopAccountSyncs: mark('stop-syncs'),
            stopBackgroundWatchdog: vi.fn(async () => { events.push('stop-watchdog'); }),
            failOutbox: mark('fail-outbox'),
            clearMessageIngest: mark('clear-ingest'),
            resetActivityAccumulator: mark('reset-activity'),
            clearSyncMaps: mark('clear-sync-maps'),
            clearRetryGuards: mark('clear-retry-guards'),
            clearPagination: mark('clear-pagination'),
            clearMissingSessionRefreshes: mark('clear-missing-session-refreshes'),
            clearDataKeys: mark('clear-data-keys'),
            clearEncryptionCache: mark('clear-encryption-cache'),
            resetPendingSettings: mark('reset-pending-settings'),
            resetGitStatus: mark('reset-git-status'),
            clearProjectManager: mark('clear-project-manager'),
            clearFileSearchCache: mark('clear-file-search-cache'),
            resetFileTransfers: mark('reset-file-transfers'),
            resetSocket: mark('reset-socket'),
            resetStorage: mark('reset-storage'),
            clearCredentials: mark('clear-credentials'),
        };

        await shutdownAccount(options);

        expect(events).toEqual([
            'end', 'remove-app-state', 'cancel-startup', 'clear-startup', 'stop-syncs', 'stop-watchdog',
            'fail-outbox', 'clear-ingest', 'reset-activity', 'clear-sync-maps',
            'clear-retry-guards', 'clear-pagination', 'clear-missing-session-refreshes',
            'clear-data-keys', 'clear-encryption-cache', 'reset-pending-settings',
            'reset-git-status', 'clear-project-manager', 'clear-file-search-cache',
            'reset-file-transfers', 'reset-socket', 'reset-storage', 'clear-credentials',
        ]);
    });
});
