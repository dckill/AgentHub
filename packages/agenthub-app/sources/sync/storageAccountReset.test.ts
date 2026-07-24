import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/sessionUtils', () => ({
    getSessionName: (session: any) => session.metadata?.name ?? session.id,
    getSessionSubtitle: (session: any) => session.metadata?.path ?? '',
}));

vi.mock('@/components/tools/knownTools', () => ({ isMutableTool: () => false }));
vi.mock('@/utils/sessionActivity', () => ({ inferThinkingFromMessages: () => null }));
vi.mock('./sync', () => ({ sync: { refreshSessions: vi.fn() } }));
vi.mock('./persistence', () => ({
    loadSettings: () => ({ settings: { projectCustomizations: {}, hideInactiveSessions: false }, version: 1 }),
    saveSettings: vi.fn(),
    loadLocalSettings: () => ({ verboseLogging: true }),
    saveLocalSettings: vi.fn(),
    loadPurchases: () => ({ activeSubscriptions: [], entitlements: {} }),
    savePurchases: vi.fn(),
    loadProfile: () => ({ id: '', timestamp: 0, firstName: null, lastName: null, avatar: null }),
    saveProfile: vi.fn(),
    loadSessionDrafts: () => ({}),
    saveSessionDrafts: vi.fn(),
    loadSessionPermissionModes: () => ({}),
    saveSessionPermissionModes: vi.fn(),
    loadSessionModelModes: () => ({}),
    saveSessionModelModes: vi.fn(),
    loadSessionEffortLevels: () => ({}),
    saveSessionEffortLevels: vi.fn(),
    loadSessionLastViewedAt: () => ({}),
    saveSessionLastViewedAt: vi.fn(),
    loadSessionLastViewedState: () => ({}),
    saveSessionLastViewedState: vi.fn(),
    loadSessionUnviewedCompletionAt: () => ({}),
    saveSessionUnviewedCompletionAt: vi.fn(),
}));

import { profileDefaults } from './profile';
import { purchasesDefaults } from './purchases';
import { settingsDefaults } from './settings';
import { storage } from './storage';

describe('storage account reset', () => {
    beforeEach(() => {
        storage.setState({
            localSettings: { ...storage.getState().localSettings, verboseLogging: true },
            settings: { ...settingsDefaults, inferenceOpenAIKey: 'account-a-key' },
            settingsVersion: 9,
            purchases: { activeSubscriptions: ['account-a'], entitlements: { pro: true } },
            profile: { ...profileDefaults, id: 'account-a' },
            sessions: { a: { id: 'a' } as any },
            sessionsData: ['online'] as any,
            sessionListViewData: [{ id: 'a' }] as any,
            projectListViewData: [{ id: 'project-a' }] as any,
            officialCodexThreads: { machine: [{ id: 'thread-a' }] as any },
            sessionLastViewedAt: { a: 1 },
            sessionLastViewedState: { a: 'thinking' },
            sessionUnviewedCompletionAt: { a: 2 },
            sessionMessages: { a: { messages: [] } as any },
            sessionGitStatus: { a: {} as any },
            sessionGitStatusFiles: { a: {} as any },
            sessionFileCache: { a: { '/secret': { content: 'secret-a' } as any } },
            machines: { a: { id: 'machine-a' } as any },
            artifacts: { a: { id: 'artifact-a' } as any },
            socketStatus: 'connected',
            socketLastConnectedAt: 10,
            socketLastDisconnectedAt: 5,
            isDataReady: true,
            nativeUpdateStatus: { available: true, updateUrl: 'https://account-a.example' },
            officialResumeSessions: { a: { threadId: 'thread-a', startedAt: 1 } },
        });
    });

    it('clears account data while preserving device-local settings and actions', () => {
        const localSettings = storage.getState().localSettings;

        storage.getState().resetAccountState();
        storage.getState().resetAccountState();

        const state = storage.getState();
        expect(state.localSettings).toBe(localSettings);
        expect(state.settings).toEqual(settingsDefaults);
        expect(state.settings).not.toBe(settingsDefaults);
        expect(state.settingsVersion).toBeNull();
        expect(state.purchases).toEqual(purchasesDefaults);
        expect(state.profile).toEqual(profileDefaults);
        expect(state.sessions).toEqual({});
        expect(state.sessionsData).toBeNull();
        expect(state.sessionListViewData).toBeNull();
        expect(state.projectListViewData).toBeNull();
        expect(state.officialCodexThreads).toEqual({});
        expect(state.sessionLastViewedAt).toEqual({});
        expect(state.sessionLastViewedState).toEqual({});
        expect(state.sessionUnviewedCompletionAt).toEqual({});
        expect(state.sessionMessages).toEqual({});
        expect(state.sessionGitStatus).toEqual({});
        expect(state.sessionGitStatusFiles).toEqual({});
        expect(state.sessionFileCache).toEqual({});
        expect(state.machines).toEqual({});
        expect(state.artifacts).toEqual({});
        expect(state.socketStatus).toBe('disconnected');
        expect(state.socketLastConnectedAt).toBeNull();
        expect(state.socketLastDisconnectedAt).toBeNull();
        expect(state.isDataReady).toBe(false);
        expect(state.nativeUpdateStatus).toBeNull();
        expect(state.officialResumeSessions).toEqual({});
        expect(state.applySessions).toEqual(expect.any(Function));
        expect(state.resetAccountState).toEqual(expect.any(Function));
    });

    it('stores an initial message load error and clears it on retry and success', () => {
        storage.getState().resetAccountState();
        storage.getState().applyMessagesLoadError('session-a', 'timeout');
        expect(storage.getState().sessionMessages['session-a']?.loadError).toBe('timeout');
        storage.getState().applyMessagesLoadError('session-a', null);
        expect(storage.getState().sessionMessages['session-a']?.loadError).toBeNull();
        storage.getState().applyMessagesLoadError('session-a', 'network');
        storage.getState().applyMessagesLoaded('session-a');
        expect(storage.getState().sessionMessages['session-a']?.loadError).toBeNull();
    });
});
