import { beforeEach, describe, expect, it, vi } from 'vitest';

const mmkvState = vi.hoisted(() => ({
    values: new Map<string, string>(),
    getString: vi.fn((key: string) => mmkvState.values.get(key)),
    set: vi.fn((key: string, value: string) => { mmkvState.values.set(key, value); }),
    delete: vi.fn((key: string) => { mmkvState.values.delete(key); }),
    clearAll: vi.fn(() => { mmkvState.values.clear(); }),
}));

vi.mock('react-native-mmkv', () => ({
    MMKV: class {
        getString(key: string) { return mmkvState.getString(key); }
        set(key: string, value: string) { mmkvState.set(key, value); }
        delete(key: string) { mmkvState.delete(key); }
        clearAll() { mmkvState.clearAll(); }
    },
}));

const draft = {
    input: 'hello',
    selectedMachineId: 'machine-1',
    selectedPath: '/repo',
    agentType: 'codex' as const,
    permissionMode: 'yolo',
    modelMode: 'default',
    effortLevel: 'medium',
    sessionType: 'simple' as const,
    worktreeKey: null,
    selectedCredentialId: null,
    updatedAt: 1,
};

describe('new session draft persistence cache', () => {
    beforeEach(() => {
        vi.resetModules();
        mmkvState.values.clear();
        mmkvState.getString.mockClear();
        mmkvState.set.mockClear();
        mmkvState.delete.mockClear();
    });

    it('reads MMKV once while returning the latest cached draft', async () => {
        const { loadNewSessionDraft } = await import('./persistence');
        mmkvState.values.set('new-session-draft-v1', JSON.stringify(draft));

        expect(loadNewSessionDraft()).toEqual(draft);
        expect(loadNewSessionDraft()).toEqual(draft);
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);
    });

    it('updates and clears the cache with writes', async () => {
        const { clearNewSessionDraft, loadNewSessionDraft, saveNewSessionDraft } = await import('./persistence');
        saveNewSessionDraft(draft);
        expect(loadNewSessionDraft()).toEqual(draft);
        expect(mmkvState.getString).not.toHaveBeenCalled();

        clearNewSessionDraft();
        expect(loadNewSessionDraft()).toBeNull();
        expect(mmkvState.getString).not.toHaveBeenCalled();
    });

    it('caches local settings while returning defensive nested copies', async () => {
        const { loadLocalSettings } = await import('./persistence');
        mmkvState.values.set('local-settings', JSON.stringify({
            consoleLoggingEnabled: true,
            sidebarPanelsOpen: ['sideChat'],
            acknowledgedCliVersions: { 'machine-1': '1.0.0' },
        }));

        const first = loadLocalSettings();
        first.sidebarPanelsOpen.push('changes');
        first.acknowledgedCliVersions['machine-2'] = '2.0.0';
        const second = loadLocalSettings();

        expect(second.consoleLoggingEnabled).toBe(true);
        expect(second.sidebarPanelsOpen).toEqual(['sideChat']);
        expect(second.acknowledgedCliVersions).toEqual({ 'machine-1': '1.0.0' });
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);
    });

    it('caches synced settings while returning defensive nested copies', async () => {
        const { loadSettings } = await import('./persistence');
        mmkvState.values.set('settings', JSON.stringify({
            settings: {
                preferredLanguage: 'zh',
                recentMachinePaths: [{ machineId: 'machine-1', path: '/repo' }],
                projectCustomizations: { 'machine-1:/repo': { name: 'Project' } },
            },
            version: 7,
        }));

        const first = loadSettings();
        first.settings.recentMachinePaths.push({ machineId: 'machine-2', path: '/other' });
        first.settings.projectCustomizations['machine-1:/repo'].name = 'mutated';
        const second = loadSettings();

        expect(second.version).toBe(7);
        expect(second.settings.preferredLanguage).toBe('zh-Hans');
        expect(second.settings.recentMachinePaths).toEqual([{ machineId: 'machine-1', path: '/repo' }]);
        expect(second.settings.projectCustomizations['machine-1:/repo']).toEqual({ name: 'Project' });
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);
    });

    it('caches pending settings while returning defensive nested copies', async () => {
        const { loadPendingSettings } = await import('./persistence');
        mmkvState.values.set('pending-settings', JSON.stringify({
            preferredLanguage: 'zh',
            recentMachinePaths: [{ machineId: 'machine-1', path: '/repo' }],
            projectCustomizations: { 'machine-1:/repo': { name: 'Project' } },
        }));

        const first = loadPendingSettings();
        first.recentMachinePaths?.push({ machineId: 'machine-2', path: '/other' });
        if (first.projectCustomizations) {
            first.projectCustomizations['machine-1:/repo'].name = 'mutated';
        }
        const second = loadPendingSettings();

        expect(second.preferredLanguage).toBe('zh');
        expect(second.recentMachinePaths).toEqual([{ machineId: 'machine-1', path: '/repo' }]);
        expect(second.projectCustomizations).toEqual({ 'machine-1:/repo': { name: 'Project' } });
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);
    });

    it('refreshes pending settings cache on save and clear', async () => {
        const { clearPersistence, loadPendingSettings, savePendingSettings } = await import('./persistence');

        savePendingSettings({ preferredLanguage: 'en' });
        expect(loadPendingSettings().preferredLanguage).toBe('en');
        expect(mmkvState.getString).not.toHaveBeenCalled();

        clearPersistence();
        mmkvState.values.set('pending-settings', JSON.stringify({ preferredLanguage: 'ja' }));
        expect(loadPendingSettings().preferredLanguage).toBe('ja');
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);
    });

    it('refreshes synced settings cache on save and clears it with persistence', async () => {
        const { clearPersistence, loadSettings, saveSettings } = await import('./persistence');

        saveSettings({ ...loadSettings().settings, preferredLanguage: 'en' }, 9);
        expect(loadSettings().version).toBe(9);
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);

        clearPersistence();
        mmkvState.values.set('settings', JSON.stringify({ settings: { preferredLanguage: 'ja' }, version: 10 }));
        expect(loadSettings().settings.preferredLanguage).toBe('ja');
        expect(loadSettings().version).toBe(10);
        expect(mmkvState.getString).toHaveBeenCalledTimes(2);
    });

    it('caches session drafts while returning defensive copies', async () => {
        const { loadSessionDrafts } = await import('./persistence');
        mmkvState.values.set('session-drafts', JSON.stringify({ 'session-1': 'draft one' }));

        const first = loadSessionDrafts();
        first['session-2'] = 'mutated locally';
        const second = loadSessionDrafts();

        expect(second).toEqual({ 'session-1': 'draft one' });
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);
    });

    it('caches purchases while returning defensive nested copies', async () => {
        const { loadPurchases } = await import('./persistence');
        mmkvState.values.set('purchases', JSON.stringify({
            activeSubscriptions: ['pro'],
            entitlements: { advanced: true },
        }));

        const first = loadPurchases();
        first.activeSubscriptions.push('mutated');
        first.entitlements.extra = true;
        const second = loadPurchases();

        expect(second).toEqual({ activeSubscriptions: ['pro'], entitlements: { advanced: true } });
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);
    });

    it('caches profile and refreshes both caches when saving', async () => {
        const { loadProfile, saveProfile } = await import('./persistence');
        mmkvState.values.set('profile', JSON.stringify({
            id: 'user-1', timestamp: 1, firstName: 'A', lastName: null,
            avatar: { width: 1, height: 1, thumbhash: 'hash', path: '/avatar', url: 'https://avatar' },
        }));

        const first = loadProfile();
        first.avatar!.url = 'mutated';
        expect(loadProfile().avatar?.url).toBe('https://avatar');

        saveProfile({ id: 'user-2', timestamp: 2, firstName: null, lastName: 'B', avatar: null });
        expect(loadProfile()).toMatchObject({ id: 'user-2', lastName: 'B' });
        expect(mmkvState.getString).toHaveBeenCalledTimes(1);
    });

    it('clears in-memory caches together with persisted values', async () => {
        const { clearPersistence, loadProfile, loadPurchases } = await import('./persistence');
        mmkvState.values.set('purchases', JSON.stringify({ activeSubscriptions: ['old'], entitlements: {} }));
        mmkvState.values.set('profile', JSON.stringify({ id: 'old', timestamp: 1, firstName: null, lastName: null, avatar: null }));

        expect(loadPurchases().activeSubscriptions).toEqual(['old']);
        expect(loadProfile().id).toBe('old');
        clearPersistence();
        mmkvState.values.set('purchases', JSON.stringify({ activeSubscriptions: ['new'], entitlements: {} }));
        mmkvState.values.set('profile', JSON.stringify({ id: 'new', timestamp: 2, firstName: null, lastName: null, avatar: null }));

        expect(loadPurchases().activeSubscriptions).toEqual(['new']);
        expect(loadProfile().id).toBe('new');
    });

    it('updates the session draft cache when persisting a new map', async () => {
        const { loadSessionDrafts, saveSessionDrafts } = await import('./persistence');

        saveSessionDrafts({ 'session-1': 'latest' });

        expect(loadSessionDrafts()).toEqual({ 'session-1': 'latest' });
        expect(mmkvState.getString).not.toHaveBeenCalled();
    });

    it('caches file transfer tasks and settings while returning defensive copies', async () => {
        const {
            clearPersistence,
            loadFileTransferSettings,
            loadFileTransferTasks,
            saveFileTransferSettings,
            saveFileTransferTasks,
        } = await import('./persistence');
        mmkvState.values.set('file-transfer-tasks-v1', JSON.stringify([{
            id: 'transfer-1',
            machineId: 'machine-1',
            direction: 'download',
            remotePath: '/remote/file.txt',
            fileName: 'file.txt',
            status: 'queued',
            downloadedBytes: 0,
            createdAt: 1,
            updatedAt: 1,
        }]));
        mmkvState.values.set('file-transfer-settings-v1', JSON.stringify({
            downloadDirectoryUri: 'file:///downloads',
            downloadDirectoryLabel: 'Downloads',
            deleteLocalFileOnRemove: true,
        }));

        const firstTasks = loadFileTransferTasks();
        firstTasks[0].status = 'completed';
        const firstSettings = loadFileTransferSettings();
        firstSettings.downloadDirectoryLabel = 'mutated';

        expect(loadFileTransferTasks()[0].status).toBe('queued');
        expect(loadFileTransferSettings().downloadDirectoryLabel).toBe('Downloads');
        expect(mmkvState.getString).toHaveBeenCalledTimes(2);

        saveFileTransferTasks([]);
        saveFileTransferSettings({ deleteLocalFileOnRemove: false });
        expect(loadFileTransferTasks()).toEqual([]);
        expect(loadFileTransferSettings()).toEqual({ deleteLocalFileOnRemove: false });
        expect(mmkvState.getString).toHaveBeenCalledTimes(2);

        clearPersistence();
        mmkvState.values.set('file-transfer-tasks-v1', JSON.stringify([]));
        mmkvState.values.set('file-transfer-settings-v1', JSON.stringify({ downloadDirectoryLabel: 'after-clear' }));
        expect(loadFileTransferTasks()).toEqual([]);
        expect(loadFileTransferSettings()).toEqual({
            downloadDirectoryLabel: 'after-clear',
            downloadDirectoryUri: undefined,
            deleteLocalFileOnRemove: false,
        });
    });

    it('caches session mode maps and refreshes them after writes and clear', async () => {
        const {
            clearPersistence,
            loadSessionEffortLevels,
            loadSessionModelModes,
            loadSessionPermissionModes,
            saveSessionEffortLevels,
            saveSessionModelModes,
            saveSessionPermissionModes,
        } = await import('./persistence');
        mmkvState.values.set('session-permission-modes', JSON.stringify({ 'session-1': 'default' }));
        mmkvState.values.set('session-model-modes', JSON.stringify({ 'session-1': 'gpt-5' }));
        mmkvState.values.set('session-effort-levels', JSON.stringify({ 'session-1': 'medium' }));

        expect(loadSessionPermissionModes()).toEqual({ 'session-1': 'default' });
        expect(loadSessionModelModes()).toEqual({ 'session-1': 'gpt-5' });
        expect(loadSessionEffortLevels()).toEqual({ 'session-1': 'medium' });
        loadSessionPermissionModes()['session-2'] = 'mutated';
        loadSessionModelModes()['session-2'] = 'mutated';
        loadSessionEffortLevels()['session-2'] = 'mutated';
        expect(loadSessionPermissionModes()).toEqual({ 'session-1': 'default' });
        expect(loadSessionModelModes()).toEqual({ 'session-1': 'gpt-5' });
        expect(loadSessionEffortLevels()).toEqual({ 'session-1': 'medium' });
        expect(mmkvState.getString).toHaveBeenCalledTimes(3);

        saveSessionPermissionModes({ 'session-1': 'plan' });
        saveSessionModelModes({ 'session-1': 'o3' });
        saveSessionEffortLevels({ 'session-1': 'high' });
        expect(loadSessionPermissionModes()).toEqual({ 'session-1': 'plan' });
        expect(loadSessionModelModes()).toEqual({ 'session-1': 'o3' });
        expect(loadSessionEffortLevels()).toEqual({ 'session-1': 'high' });
        expect(mmkvState.getString).toHaveBeenCalledTimes(3);

        clearPersistence();
        mmkvState.values.set('session-permission-modes', JSON.stringify({ 'session-1': 'default' }));
        mmkvState.values.set('session-model-modes', JSON.stringify({ 'session-1': 'gpt-5' }));
        mmkvState.values.set('session-effort-levels', JSON.stringify({ 'session-1': 'medium' }));
        expect(loadSessionPermissionModes()).toEqual({ 'session-1': 'default' });
        expect(loadSessionModelModes()).toEqual({ 'session-1': 'gpt-5' });
        expect(loadSessionEffortLevels()).toEqual({ 'session-1': 'medium' });
    });

    it('caches push token and session activity maps with defensive copies', async () => {
        const {
            clearPersistence,
            loadRegisteredPushToken,
            loadSessionLastViewedAt,
            loadSessionLastViewedState,
            loadSessionUnviewedCompletionAt,
            saveRegisteredPushToken,
            saveSessionLastViewedAt,
            saveSessionLastViewedState,
            saveSessionUnviewedCompletionAt,
        } = await import('./persistence');
        mmkvState.values.set('registered-push-token-v1', 'ExponentPushToken[old]');
        mmkvState.values.set('session-last-viewed-at-v1', JSON.stringify({ 'session-1': 10 }));
        mmkvState.values.set('session-unviewed-completion-at-v1', JSON.stringify({ 'session-1': 20 }));
        mmkvState.values.set('session-last-viewed-state-v1', JSON.stringify({ 'session-1': 'waiting' }));

        expect(loadRegisteredPushToken()).toBe('ExponentPushToken[old]');
        expect(loadSessionLastViewedAt()).toEqual({ 'session-1': 10 });
        expect(loadSessionUnviewedCompletionAt()).toEqual({ 'session-1': 20 });
        expect(loadSessionLastViewedState()).toEqual({ 'session-1': 'waiting' });
        loadSessionLastViewedAt()['session-2'] = 30;
        loadSessionUnviewedCompletionAt()['session-2'] = 40;
        loadSessionLastViewedState()['session-2'] = 'active';

        expect(loadSessionLastViewedAt()).toEqual({ 'session-1': 10 });
        expect(loadSessionUnviewedCompletionAt()).toEqual({ 'session-1': 20 });
        expect(loadSessionLastViewedState()).toEqual({ 'session-1': 'waiting' });
        expect(mmkvState.getString).toHaveBeenCalledTimes(4);

        saveRegisteredPushToken('ExponentPushToken[new]');
        saveSessionLastViewedAt({ 'session-1': 11 });
        saveSessionUnviewedCompletionAt({ 'session-1': 21 });
        saveSessionLastViewedState({ 'session-1': 'active' });
        expect(loadRegisteredPushToken()).toBe('ExponentPushToken[new]');
        expect(loadSessionLastViewedAt()).toEqual({ 'session-1': 11 });
        expect(loadSessionUnviewedCompletionAt()).toEqual({ 'session-1': 21 });
        expect(loadSessionLastViewedState()).toEqual({ 'session-1': 'active' });
        expect(mmkvState.getString).toHaveBeenCalledTimes(4);

        clearPersistence();
        mmkvState.values.set('registered-push-token-v1', 'ExponentPushToken[after-clear]');
        mmkvState.values.set('session-last-viewed-at-v1', JSON.stringify({ 'session-1': 12 }));
        mmkvState.values.set('session-unviewed-completion-at-v1', JSON.stringify({ 'session-1': 22 }));
        mmkvState.values.set('session-last-viewed-state-v1', JSON.stringify({ 'session-1': 'done' }));
        expect(loadRegisteredPushToken()).toBe('ExponentPushToken[after-clear]');
        expect(loadSessionLastViewedAt()).toEqual({ 'session-1': 12 });
        expect(loadSessionUnviewedCompletionAt()).toEqual({ 'session-1': 22 });
        expect(loadSessionLastViewedState()).toEqual({ 'session-1': 'done' });
    });
});
