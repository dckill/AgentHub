import { describe, expect, it, vi } from 'vitest';
import {
    collectProjectSessionIds,
    refreshOfficialThreadsForProjectList,
    refreshProjectSessionList,
} from './sessionListRefresh';
import type { Machine, Session } from './storageTypes';
import type { ProjectGroupData, ProjectListViewItem, SessionRowData } from './storageProjection';

function machine(overrides: Partial<Machine> = {}): Machine {
    return {
        id: 'machine-1',
        seq: 1,
        createdAt: 10,
        updatedAt: 10,
        active: true,
        activeAt: 10,
        metadata: {
            host: 'devbox',
            platform: 'linux',
            agentHubCliVersion: '1.0.0',
            agentHubHomeDir: '/home/dev/.agenthub',
            homeDir: '/home/dev',
            cliAvailability: {
                codex: true,
                claude: true,
                detectedAt: 1,
            },
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
        ...overrides,
    };
}

function session(overrides: Partial<Session> = {}): Session {
    return {
        id: 'session-1',
        seq: 1,
        metadata: {
            machineId: 'machine-1',
            host: 'devbox',
            path: '/repo',
            homeDir: '/home/dev',
        },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        active: true,
        activeAt: 10,
        presence: 'online',
        thinking: false,
        thinkingAt: 0,
        createdAt: 10,
        updatedAt: 10,
        ...overrides,
    };
}

function sessionRow(overrides: Partial<SessionRowData> = {}): SessionRowData {
    return {
        id: 'session-1',
        name: 'Active',
        subtitle: '',
        flavor: null,
        state: 'thinking',
        hasDraft: false,
        active: true,
        machineId: 'machine-1',
        path: '/repo',
        homeDir: '/home/dev',
        completedTodosCount: 0,
        totalTodosCount: 0,
        hasUnviewedCompletion: false,
        ...overrides,
    };
}

function projectItem(overrides: Partial<ProjectGroupData> = {}): ProjectListViewItem {
    return {
        type: 'project-group',
        project: {
            key: 'machine-1:/repo',
            icon: 'terminal',
            displayName: 'repo',
            path: '/repo',
            displayPath: '~/repo',
            machineId: 'machine-1',
            machineName: 'devbox',
            branch: 'main',
            isWorktree: false,
            worktreeName: null,
            linesAdded: 0,
            linesRemoved: 0,
            archived: false,
            activeSessions: [],
            archivedSessions: [],
            officialCodexThreads: [],
            ...overrides,
        },
    };
}

describe('session list refresh helpers', () => {
    it('collects one representative session id for every visible project', () => {
        expect(collectProjectSessionIds([
            projectItem({ activeSessions: [sessionRow()] }),
            projectItem({ key: 'machine-1:/repo-2', activeSessions: [], archivedSessions: [sessionRow({ id: 'archived-1', name: 'Archived', state: 'disconnected', active: false, path: '/repo-2' })] }),
            { type: 'machine-separator', machineId: 'machine-1', machineName: 'devbox' },
        ])).toEqual(['session-1', 'archived-1']);
    });

    it('refreshes sessions, machines, git status, and official desktop threads from manual status sync', async () => {
        const refreshSessions = vi.fn().mockResolvedValue(undefined);
        const refreshMachines = vi.fn().mockResolvedValue(undefined);
        const invalidateGitStatus = vi.fn();
        const refreshOfficialThreads = vi.fn().mockResolvedValue(undefined);

        await refreshProjectSessionList({
            projectItems: [projectItem({ activeSessions: [sessionRow()] })],
            machines: [machine()],
            refreshSessions,
            refreshMachines,
            invalidateGitStatus,
            refreshOfficialThreads,
        });

        expect(refreshSessions).toHaveBeenCalledTimes(1);
        expect(refreshMachines).toHaveBeenCalledTimes(1);
        expect(invalidateGitStatus).toHaveBeenCalledWith('session-1');
        expect(refreshOfficialThreads).toHaveBeenCalledWith({
            projectItems: expect.any(Array),
            machines: expect.any(Array),
        });
    });

    it('discovers official desktop sessions scoped to active projects', async () => {
        const listOfficialThreads = vi.fn().mockResolvedValue([
            { id: 'thread-1', machineId: 'machine-1', cwd: '/repo', title: 'Desktop session', updatedAt: 20, archived: false, provider: 'codex' },
            { id: 'thread-2', machineId: 'machine-1', cwd: '/other', title: 'Other', updatedAt: 21, archived: false, provider: 'codex' },
        ]);
        const applyOfficialThreads = vi.fn();
        const archiveOfficialMirrors = vi.fn().mockResolvedValue({ checkedThreadCount: 0, archivedSessionCount: 0 });

        await refreshOfficialThreadsForProjectList({
            projectItems: [projectItem()],
            machines: [machine()],
            sessions: {},
            listOfficialThreads,
            applyOfficialThreads,
            archiveOfficialMirrors,
        });

        expect(listOfficialThreads).toHaveBeenCalledWith('machine-1', {
            paths: ['/repo'],
            providers: ['codex', 'claude'],
            limit: 50,
        });
        expect(applyOfficialThreads).toHaveBeenCalledWith('machine-1', [
            expect.objectContaining({ id: 'thread-1', cwd: '/repo' }),
        ]);
        expect(archiveOfficialMirrors).toHaveBeenCalledWith('machine-1', {});
    });

    it('keeps the last successful official thread list when discovery temporarily fails', async () => {
        const applyOfficialThreads = vi.fn();

        await refreshOfficialThreadsForProjectList({
            projectItems: [projectItem()],
            machines: [machine()],
            sessions: {},
            listOfficialThreads: vi.fn().mockRejectedValue(new Error('RPC temporarily unavailable')),
            applyOfficialThreads,
            archiveOfficialMirrors: vi.fn(),
        });

        expect(applyOfficialThreads).not.toHaveBeenCalled();
    });

    it('keeps cached official threads while a machine is transiently offline', async () => {
        const applyOfficialThreads = vi.fn();

        await refreshOfficialThreadsForProjectList({
            projectItems: [projectItem()],
            machines: [machine({ active: false })],
            sessions: {},
            listOfficialThreads: vi.fn(),
            applyOfficialThreads,
            archiveOfficialMirrors: vi.fn(),
        });

        expect(applyOfficialThreads).not.toHaveBeenCalled();
    });

    it('applies an authoritative successful empty official thread result', async () => {
        const applyOfficialThreads = vi.fn();

        await refreshOfficialThreadsForProjectList({
            projectItems: [projectItem()],
            machines: [machine()],
            sessions: {},
            listOfficialThreads: vi.fn().mockResolvedValue([]),
            applyOfficialThreads,
            archiveOfficialMirrors: vi.fn().mockResolvedValue(undefined),
        });

        expect(applyOfficialThreads).toHaveBeenCalledWith('machine-1', []);
    });
});
