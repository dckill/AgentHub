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
    loadLocalSettings: () => ({}),
    saveLocalSettings: vi.fn(),
    loadPurchases: () => ({}),
    savePurchases: vi.fn(),
    loadProfile: () => ({}),
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

import { settingsDefaults } from './settings';
import { storage } from './storage';
import type { Session } from './storageTypes';

function inactiveSession(index: number): Session {
    return {
        id: `inactive-${index}`,
        seq: index,
        createdAt: index,
        updatedAt: index,
        active: false,
        activeAt: index,
        metadata: {
            machineId: 'machine-1',
            path: `/repo/${index}`,
            host: 'host',
            homeDir: '/home/user',
            flavor: 'codex',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: index,
        presence: 0,
    };
}

describe('storage inactive message retention', () => {
    beforeEach(() => {
        storage.getState().resetAccountState();
        storage.setState({
            settings: { ...settingsDefaults, projectCustomizations: {}, hideInactiveSessions: false },
            sessions: {},
            sessionMessages: {},
            sessionLastViewedAt: {},
            sessionLastViewedState: {},
            sessionUnviewedCompletionAt: {},
        });
    });

    it.each([
        ['message', () => storage.getState().applyMessages('inactive-0', [{
            role: 'user',
            content: { type: 'text', text: 'late message' },
            id: 'late-message',
            localId: null,
            createdAt: 100,
            isSidechain: false,
        }])],
        ['load error', () => storage.getState().applyMessagesLoadError('inactive-0', 'network')],
        ['loaded state', () => storage.getState().applyMessagesLoaded('inactive-0')],
        ['history state', () => storage.getState().applyMessageHistoryState('inactive-0', { isLoadingBefore: true })],
    ])('does not resurrect an evicted inactive session after a delayed %s update', (_label, applyDelayedUpdate) => {
        const sessions = Array.from({ length: 25 }, (_, index) => inactiveSession(index));
        for (const session of sessions) {
            storage.getState().applyMessagesLoadError(session.id, 'timeout');
        }
        storage.getState().applySessions(sessions);

        expect(Object.keys(storage.getState().sessionMessages)).toHaveLength(20);
        expect(storage.getState().sessionMessages['inactive-0']).toBeUndefined();

        applyDelayedUpdate();

        expect(Object.keys(storage.getState().sessionMessages)).toHaveLength(20);
        expect(storage.getState().sessionMessages['inactive-0']).toBeUndefined();
    });
});
