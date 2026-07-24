import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/sessionUtils', () => ({
    getSessionName: (session: any) => session.metadata?.name ?? session.id,
    getSessionSubtitle: (session: any) => session.metadata?.path ?? '',
}));

vi.mock('@/components/tools/knownTools', () => ({
    isMutableTool: () => false,
}));

vi.mock('@/utils/sessionActivity', () => ({
    inferThinkingFromMessages: () => null,
}));

vi.mock('./sync', () => ({
    sync: {
        refreshSessions: vi.fn(),
    },
}));

vi.mock('./persistence', () => ({
    loadSettings: () => ({
        settings: {
            projectCustomizations: {},
            hideInactiveSessions: false,
        },
        version: 1,
    }),
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

import { projectManager } from './projectManager';
import { storage } from './storage';
import type { GitStatus, Machine, Session } from './storageTypes';

function session(overrides: Partial<Session> = {}): Session {
    return {
        id: 's1',
        seq: 1,
        createdAt: 200,
        updatedAt: 200,
        active: true,
        activeAt: 200,
        metadata: {
            machineId: 'm1',
            path: '/home/me/repo',
            host: 'laptop',
            homeDir: '/home/me',
            flavor: 'codex',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        thinking: false,
        thinkingAt: 0,
        presence: 'online',
        ...overrides,
    };
}

function machine(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'm1',
        seq: 1,
        createdAt: 100,
        updatedAt: 100,
        active: true,
        activeAt: 100,
        metadata: {
            host: 'laptop',
            platform: 'linux',
            agentHubCliVersion: '1.0.0',
            agentHubHomeDir: '/home/me/.agenthub',
            homeDir: '/home/me',
            displayName: 'Laptop',
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
        ...overrides,
    };
}

function gitStatus(branch: string): GitStatus {
    return {
        branch,
        isDirty: false,
        modifiedCount: 0,
        untrackedCount: 0,
        stagedCount: 0,
        lastUpdatedAt: 300,
        stagedLinesAdded: 0,
        stagedLinesRemoved: 0,
        unstagedLinesAdded: 0,
        unstagedLinesRemoved: 0,
        linesAdded: 0,
        linesRemoved: 0,
        linesChanged: 0,
    };
}

describe('storage git status projection', () => {
    afterEach(() => {
        vi.useRealTimers();
    });

    beforeEach(() => {
        projectManager.clear();
        storage.setState({
            settings: {
                ...storage.getState().settings,
                projectCustomizations: {},
                hideInactiveSessions: false,
            },
            sessions: {},
            machines: {},
            sessionGitStatus: {},
            sessionGitStatusFiles: {},
            sessionLastViewedAt: {},
            sessionLastViewedState: {},
            sessionUnviewedCompletionAt: {},
            sessionListViewData: null,
            projectListViewData: null,
            isDataReady: true,
        });
    });

    it('refreshes the project list snapshot when git status changes', () => {
        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([session()]);

        const before = storage.getState().projectListViewData;
        expect(before?.find(item => item.type === 'project-group')).toMatchObject({
            type: 'project-group',
            project: expect.objectContaining({ branch: null }),
        });

        storage.getState().applyGitStatus('s1', gitStatus('feature/instant-branch'));

        const after = storage.getState().projectListViewData;
        expect(after?.find(item => item.type === 'project-group')).toMatchObject({
            type: 'project-group',
            project: expect.objectContaining({ branch: 'feature/instant-branch' }),
        });
    });

    it('removes sessions missing from a full sessions refresh', () => {
        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([
            session({ id: 'deleted-session' }),
            session({ id: 'kept-session' }),
        ]);

        storage.getState().applySessions([
            session({ id: 'kept-session', updatedAt: 300 }),
        ], true);

        expect(storage.getState().sessions['deleted-session']).toBeUndefined();
        expect(storage.getState().sessions['kept-session']).toBeDefined();
        expect(storage.getState().sessionListViewData).not.toContainEqual(
            expect.objectContaining({
                session: expect.objectContaining({ id: 'deleted-session' }),
            }),
        );
    });

    it('keeps existing sessions during an incremental session update', () => {
        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([
            session({ id: 'other-session' }),
            session({ id: 'updated-session' }),
        ]);

        storage.getState().applySessions([
            session({ id: 'updated-session', updatedAt: 300 }),
        ]);

        expect(storage.getState().sessions['other-session']).toBeDefined();
        expect(storage.getState().sessions['updated-session']?.updatedAt).toBe(300);
    });

    it('does not let a stale refresh erase a newer local archive lifecycle projection', () => {
        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([
            session({
                metadata: {
                    ...session().metadata!,
                    lifecycleState: 'archiveRequested',
                    lifecycleStateSince: 500,
                },
                active: false,
                updatedAt: 500,
            }),
        ]);

        storage.getState().applySessions([
            session({
                metadata: {
                    ...session().metadata!,
                    lifecycleState: 'running',
                    lifecycleStateSince: 400,
                },
                active: true,
                updatedAt: 400,
            }),
        ]);

        expect(storage.getState().sessions.s1).toMatchObject({
            active: false,
            metadata: {
                lifecycleState: 'archiveRequested',
                lifecycleStateSince: 500,
            },
        });
    });

    it('keeps the local archive projection when refresh and local lifecycle timestamps are equal', () => {
        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([
            session({
                metadata: {
                    ...session().metadata!,
                    lifecycleState: 'archiveRequested',
                    lifecycleStateSince: 500,
                },
                active: false,
                updatedAt: 500,
            }),
        ]);

        storage.getState().applySessions([
            session({
                metadata: {
                    ...session().metadata!,
                    lifecycleState: 'running',
                    lifecycleStateSince: 500,
                },
                active: true,
                updatedAt: 500,
            }),
        ]);

        expect(storage.getState().sessions.s1).toMatchObject({
            active: false,
            metadata: { lifecycleState: 'archiveRequested' },
        });
    });

    it('accepts a strictly newer server archived lifecycle over a local request projection', () => {
        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([
            session({
                metadata: {
                    ...session().metadata!,
                    lifecycleState: 'archiveRequested',
                    lifecycleStateSince: 500,
                },
                active: false,
                updatedAt: 500,
            }),
        ]);

        storage.getState().applySessions([
            session({
                metadata: {
                    ...session().metadata!,
                    lifecycleState: 'archived',
                    lifecycleStateSince: 600,
                    archivedBy: 'cli',
                    archiveReason: 'runner exited',
                },
                active: false,
                updatedAt: 600,
            }),
        ]);

        expect(storage.getState().sessions.s1).toMatchObject({
            active: false,
            metadata: {
                lifecycleState: 'archived',
                lifecycleStateSince: 600,
                archivedBy: 'cli',
            },
        });
    });

    it('marks a completed active session as unviewed until the session is opened', () => {
        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([
            session({ id: 's1', thinking: true, updatedAt: 200 }),
        ]);

        storage.getState().applySessions([
            session({ id: 's1', thinking: false, updatedAt: 300 }),
        ]);

        expect(storage.getState().projectListViewData?.find(item => item.type === 'project-group')).toMatchObject({
            type: 'project-group',
            project: {
                activeSessions: [
                    expect.objectContaining({
                        id: 's1',
                        state: 'waiting',
                        hasUnviewedCompletion: true,
                    }),
                ],
            },
        });

        storage.getState().markSessionViewed('s1');

        expect(storage.getState().projectListViewData?.find(item => item.type === 'project-group')).toMatchObject({
            type: 'project-group',
            project: {
                activeSessions: [
                    expect.objectContaining({
                        id: 's1',
                        state: 'waiting',
                        hasUnviewedCompletion: false,
                    }),
                ],
            },
        });
    });

    it('does not mark initially loaded waiting sessions as unviewed completions', () => {
        storage.getState().applyMachines([machine()], true);

        storage.getState().applySessions([
            session({ id: 's1', thinking: false, updatedAt: 300 }),
        ]);

        expect(storage.getState().projectListViewData?.find(item => item.type === 'project-group')).toMatchObject({
            type: 'project-group',
            project: {
                activeSessions: [
                    expect.objectContaining({
                        id: 's1',
                        state: 'waiting',
                        hasUnviewedCompletion: false,
                    }),
                ],
            },
        });
    });

    it('keeps a viewed waiting session idle when later non-completion updates refresh updatedAt', () => {
        vi.useFakeTimers();
        vi.setSystemTime(100);

        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([
            session({ id: 's1', thinking: true, updatedAt: 200 }),
        ]);
        storage.getState().applySessions([
            session({ id: 's1', thinking: false, updatedAt: 300 }),
        ]);
        vi.setSystemTime(350);
        storage.getState().markSessionViewed('s1');

        storage.getState().applySessions([
            session({ id: 's1', thinking: false, updatedAt: 400 }),
        ]);

        expect(storage.getState().projectListViewData?.find(item => item.type === 'project-group')).toMatchObject({
            type: 'project-group',
            project: {
                activeSessions: [
                    expect.objectContaining({
                        id: 's1',
                        state: 'waiting',
                        hasUnviewedCompletion: false,
                    }),
                ],
            },
        });
    });

    it('marks a session as unviewed when it was busy on view and is later observed waiting', () => {
        vi.useFakeTimers();
        vi.setSystemTime(100);

        storage.getState().applyMachines([machine()], true);
        storage.getState().applySessions([
            session({ id: 's1', thinking: true, updatedAt: 200 }),
        ]);
        storage.getState().markSessionViewed('s1');

        vi.setSystemTime(350);
        storage.getState().applySessions([
            session({ id: 's1', thinking: false, updatedAt: 300 }),
        ]);

        expect(storage.getState().projectListViewData?.find(item => item.type === 'project-group')).toMatchObject({
            type: 'project-group',
            project: {
                activeSessions: [
                    expect.objectContaining({
                        id: 's1',
                        state: 'waiting',
                        hasUnviewedCompletion: true,
                    }),
                ],
            },
        });
    });
});
