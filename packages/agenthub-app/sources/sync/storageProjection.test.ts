import { describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/sessionUtils', () => ({
    getSessionName: (session: any) => session.metadata?.name ?? session.id,
    getSessionSubtitle: (session: any) => session.metadata?.path ?? '',
}));

import {
    buildOfficialCodexThreadRowData,
    buildProjectListViewData,
    buildSessionListViewData,
    buildSessionRowData,
    isSandboxEnabled,
} from './storageProjection';

function session(overrides: any) {
    return {
        id: overrides.id,
        active: false,
        activeAt: 0,
        createdAt: 1700000000000,
        presence: 'offline',
        thinking: false,
        draft: '',
        todos: [],
        metadata: {},
        ...overrides,
    } as any;
}

describe('storageProjection', () => {
    it('derives row state, draft, todos, and sandbox fields', () => {
        const row = buildSessionRowData(session({
            id: 's1',
            active: true,
            presence: 'online',
            updatedAt: 200,
            agentState: { requests: { r1: {} } },
            draft: 'hello',
            todos: [{ status: 'completed' }, { status: 'pending' }],
            metadata: { machineId: 'm1', path: '/repo', homeDir: '/home/me', flavor: 'codex', sandbox: { enabled: true } },
        }));

        expect(row).toMatchObject({
            id: 's1',
            state: 'permission_required',
            hasDraft: true,
            machineId: 'm1',
            path: '/repo',
            completedTodosCount: 1,
            totalTodosCount: 2,
        });
        expect(isSandboxEnabled(row as any)).toBe(false);
        expect(isSandboxEnabled({ enabled: true } as any)).toBe(false);
        expect(isSandboxEnabled({ sandbox: { enabled: true } } as any)).toBe(true);
    });

    it('marks active waiting sessions with newer completion activity as unviewed', () => {
        const row = buildSessionRowData(session({
            id: 's1',
            active: true,
            presence: 'online',
            updatedAt: 200,
        }), {
            lastViewedAt: 100,
            unviewedCompletionAt: 200,
        });

        expect(row).toMatchObject({
            id: 's1',
            state: 'waiting',
            hasUnviewedCompletion: true,
        });
    });

    it('does not mark active waiting sessions as unviewed only because updatedAt changed', () => {
        const row = buildSessionRowData(session({
            id: 's1',
            active: true,
            presence: 'online',
            updatedAt: 300,
        }), {
            lastViewedAt: 200,
        });

        expect(row.hasUnviewedCompletion).toBe(false);
    });

    it('does not mark viewed, busy, or archived sessions as unviewed completions', () => {
        expect(buildSessionRowData(session({
            id: 'viewed',
            active: true,
            presence: 'online',
            updatedAt: 200,
        }), {
            lastViewedAt: 200,
            unviewedCompletionAt: 150,
        }).hasUnviewedCompletion).toBe(false);

        expect(buildSessionRowData(session({
            id: 'busy',
            active: true,
            presence: 'online',
            thinking: true,
            updatedAt: 200,
        }), {
            lastViewedAt: 100,
            unviewedCompletionAt: 200,
        }).hasUnviewedCompletion).toBe(false);

        expect(buildSessionRowData(session({
            id: 'archived',
            active: false,
            presence: 'online',
            updatedAt: 200,
        }), {
            lastViewedAt: 100,
            unviewedCompletionAt: 200,
        }).hasUnviewedCompletion).toBe(false);
    });

    it('groups active and archived sessions for the session list', () => {
        const items = buildSessionListViewData({
            active: session({ id: 'active', active: true, createdAt: 1700000002000 }),
            archived: session({ id: 'archived', active: false, createdAt: 1700000001000 }),
        } as any, false);

        expect(items[0]).toMatchObject({ type: 'active-sessions', sessions: [{ id: 'active' }] });
        expect(items).toContainEqual({ type: 'archive-toggle', hidden: false });
        expect(items.some(item => item.type === 'session' && item.session.id === 'archived')).toBe(true);
    });

    it('hides archived sessions when requested', () => {
        const items = buildSessionListViewData({
            active: session({ id: 'active', active: true }),
            archived: session({ id: 'archived', active: false }),
        } as any, true);

        expect(items).toEqual([{ type: 'active-sessions', sessions: [expect.objectContaining({ id: 'active' })] }]);
    });

    it('builds project groups with custom labels, git status, and worktree metadata', () => {
        const sessions = {
            s1: session({
                id: 's1',
                active: true,
                createdAt: 200,
                metadata: { machineId: 'm1', path: '/home/me/repo/.dev/worktree/feature-a', homeDir: '/home/me' },
            }),
            s2: session({
                id: 's2',
                active: false,
                createdAt: 100,
                metadata: { machineId: 'm1', path: '/home/me/repo/.dev/worktree/feature-a', homeDir: '/home/me' },
            }),
        } as any;

        const items = buildProjectListViewData(
            sessions,
            { m1: { metadata: { displayName: 'Laptop' } } } as any,
            { 'm1:/home/me/repo/.dev/worktree/feature-a': { name: 'Feature A', icon: 'icon:terminal' } },
            () => ({ branch: 'main', unstagedLinesAdded: 3, unstagedLinesRemoved: 2 } as any),
            false,
        );

        expect(items).toEqual([
            {
                type: 'machine-separator',
                machineId: 'm1',
                machineName: 'Laptop',
            },
            {
                type: 'project-group',
                project: expect.objectContaining({
                    key: 'm1:/home/me/repo/.dev/worktree/feature-a',
                    displayName: 'Feature A',
                    icon: 'icon:terminal',
                    displayPath: '~/repo/.dev/worktree/feature-a',
                    machineName: 'Laptop',
                    branch: 'main',
                    isWorktree: true,
                    worktreeName: 'feature-a',
                    linesAdded: 3,
                    linesRemoved: 2,
                }),
            },
        ]);
    });

    it('groups sessions under the same project when paths differ only by separators', () => {
        const sessions = {
            s1: session({
                id: 's1',
                active: true,
                createdAt: 200,
                metadata: { machineId: 'm1', path: '/home/me/repo/', homeDir: '/home/me', flavor: 'codex' },
            }),
            s2: session({
                id: 's2',
                active: true,
                createdAt: 100,
                metadata: { machineId: 'm1', path: '/home/me//repo', homeDir: '/home/me', flavor: 'claude' },
            }),
        } as any;

        const items = buildProjectListViewData(
            sessions,
            { m1: { metadata: { displayName: 'Laptop' } } } as any,
            {},
            () => null,
            false,
        );

        const projectItems = items.filter((item) => item.type === 'project-group');
        expect(projectItems).toHaveLength(1);
        expect(projectItems[0]).toMatchObject({
            type: 'project-group',
            project: {
                key: 'm1:/home/me/repo',
                activeSessions: [
                    expect.objectContaining({ id: 's1', flavor: 'codex' }),
                    expect.objectContaining({ id: 's2', flavor: 'claude' }),
                ],
            },
        });
    });

    it('hides archived project groups that have no active sessions', () => {
        const sessions = {
            s1: session({
                id: 's1',
                active: false,
                createdAt: 200,
                metadata: { machineId: 'm1', path: '/home/me/repo', homeDir: '/home/me' },
            }),
        } as any;

        const items = buildProjectListViewData(
            sessions,
            { m1: { metadata: { displayName: 'Laptop' } } } as any,
            { 'm1:/home/me/repo': { archived: true } },
            () => null,
            false,
        );

        expect(items).toEqual([]);
    });

    it('does not revive a hidden project only because official threads still exist', () => {
        const items = buildProjectListViewData(
            {} as any,
            { m1: { metadata: { displayName: 'Laptop', homeDir: '/home/me' } } } as any,
            { 'm1:/home/me/repo': { archived: true } },
            () => null,
            false,
            [{
                id: 'thread-1',
                machineId: 'm1',
                cwd: '/home/me/repo',
                title: 'Official thread',
                updatedAt: 123,
                archived: false,
                gitBranch: 'main',
            }],
        );

        expect(items).toEqual([]);
    });

    it('keeps hidden projects visible when a new active AgentHub session appears', () => {
        const items = buildProjectListViewData(
            {
                active: session({
                    id: 'active',
                    active: true,
                    createdAt: 200,
                    metadata: { machineId: 'm1', path: '/home/me/repo', homeDir: '/home/me' },
                }),
            } as any,
            { m1: { metadata: { displayName: 'Laptop', homeDir: '/home/me' } } } as any,
            { 'm1:/home/me/repo': { archived: true } },
            () => null,
            false,
        );

        expect(items).toEqual([
            {
                type: 'machine-separator',
                machineId: 'm1',
                machineName: 'Laptop',
            },
            {
                type: 'project-group',
                project: expect.objectContaining({
                    key: 'm1:/home/me/repo',
                    archived: true,
                    activeSessions: [expect.objectContaining({ id: 'active' })],
                }),
            },
        ]);
    });

    it('does not let archived AgentHub Codex mirrors hide active official threads', () => {
        const items = buildProjectListViewData(
            {
                staleMirror: session({
                    id: 'staleMirror',
                    active: false,
                    createdAt: 100,
                    metadata: {
                        machineId: 'm1',
                        path: '/home/me/repo',
                        homeDir: '/home/me',
                        flavor: 'codex',
                        codexThreadId: 'thread-1',
                        lifecycleState: 'archived',
                    },
                }),
            } as any,
            { m1: { metadata: { displayName: 'Laptop', homeDir: '/home/me' } } } as any,
            {},
            () => null,
            false,
            [{
                id: 'thread-1',
                machineId: 'm1',
                cwd: '/home/me/repo',
                title: 'Official thread',
                updatedAt: 123,
                archived: false,
                gitBranch: 'main',
            }],
        );

        expect(items).toEqual([
            {
                type: 'machine-separator',
                machineId: 'm1',
                machineName: 'Laptop',
            },
            {
                type: 'project-group',
                project: expect.objectContaining({
                    activeSessions: [],
                    archivedSessions: [expect.objectContaining({ id: 'staleMirror' })],
                    officialCodexThreads: [expect.objectContaining({ codexThreadId: 'thread-1' })],
                }),
            },
        ]);
    });

    it('never lists archived official threads even if a daemon returns them', () => {
        const items = buildProjectListViewData(
            {} as any,
            { m1: { metadata: { displayName: 'Laptop', homeDir: '/home/me' } } } as any,
            {},
            () => null,
            false,
            [{
                id: 'thread-archived',
                machineId: 'm1',
                cwd: '/home/me/repo',
                title: 'Archived official thread',
                updatedAt: 123,
                archived: true,
                gitBranch: 'main',
            }],
        );

        expect(items).toEqual([]);
    });

    it('builds official codex thread rows', () => {
        const row = buildOfficialCodexThreadRowData({
            id: 'thread-1',
            machineId: 'm1',
            cwd: '/home/me/repo',
            title: 'Official thread',
            updatedAt: 200,
            archived: false,
        }, '/home/me');

        expect(row).toMatchObject({
            source: 'official-codex',
            codexThreadId: 'thread-1',
            subtitle: '~/repo',
            flavor: 'codex',
        });
    });

    it('builds official claude session rows', () => {
        const row = buildOfficialCodexThreadRowData({
            id: '93a9705e-bc6a-406d-8dce-8acc014dedbd',
            machineId: 'm1',
            cwd: '/home/me/repo',
            title: 'Official Claude session',
            updatedAt: 200,
            archived: false,
            provider: 'claude',
        }, '/home/me');

        expect(row).toMatchObject({
            source: 'official-claude',
            claudeSessionId: '93a9705e-bc6a-406d-8dce-8acc014dedbd',
            codexThreadId: null,
            subtitle: '~/repo',
            flavor: 'claude',
        });
    });

    it('does not create default project groups from official codex threads alone', () => {
        const items = buildProjectListViewData(
            {} as any,
            { m1: { metadata: { displayName: 'Laptop', homeDir: '/home/me' } } } as any,
            {},
            () => null,
            false,
            [{
                id: 'thread-1',
                machineId: 'm1',
                cwd: '/home/me/repo',
                title: 'Official thread',
                updatedAt: 123,
                archived: false,
                gitBranch: 'main',
            }],
        );

        expect(items).toEqual([]);
    });

    it('keeps scoped official candidates separate from active session rows', () => {
        const items = buildProjectListViewData(
            {
                s1: session({
                    id: 's1',
                    active: true,
                    createdAt: 200,
                    metadata: { machineId: 'm1', path: '/repo/app', homeDir: '/home/me' },
                }),
            } as any,
            { m1: { metadata: { displayName: 'Laptop', homeDir: '/home/me' } } } as any,
            {},
            () => null,
            false,
            [
                {
                    id: 'codex-current',
                    machineId: 'm1',
                    cwd: '/repo/app',
                    title: 'Current Codex thread',
                    updatedAt: 123,
                    archived: false,
                    gitBranch: 'main',
                    provider: 'codex',
                },
                {
                    id: 'claude-test',
                    machineId: 'm1',
                    cwd: '/tmp/test',
                    title: 'Test Claude session',
                    updatedAt: 124,
                    archived: false,
                    gitBranch: 'main',
                    provider: 'claude',
                },
                {
                    id: 'claude-child',
                    machineId: 'm1',
                    cwd: '/repo/app/packages/mobile',
                    title: 'Child directory Claude session',
                    updatedAt: 125,
                    archived: false,
                    gitBranch: 'main',
                    provider: 'claude',
                },
            ],
        );

        const projectItems = items.filter((item) => item.type === 'project-group');
        expect(projectItems).toHaveLength(1);
        expect(projectItems[0]).toMatchObject({
            type: 'project-group',
            project: {
                path: '/repo/app',
                activeSessions: [expect.objectContaining({ id: 's1', source: 'agenthub' })],
                officialCodexThreads: [expect.objectContaining({ codexThreadId: 'codex-current', source: 'official-codex' })],
            },
        });
        expect(projectItems[0].project.officialCodexThreads.some((thread) => thread.codexThreadId === 'claude-child')).toBe(false);
        expect(projectItems.some((item) => item.project.path === '/tmp/test')).toBe(false);
    });

    it('keeps all official candidates per project ordered by recency', () => {
        const officialThreads = Array.from({ length: 7 }, (_, index) => ({
            id: `thread-${index + 1}`,
            machineId: 'm1',
            cwd: '/repo/app',
            title: `Official thread ${index + 1}`,
            updatedAt: index + 1,
            archived: false,
            gitBranch: 'main',
            provider: 'codex' as const,
        }));

        const items = buildProjectListViewData(
            {
                s1: session({
                    id: 's1',
                    active: true,
                    createdAt: 200,
                    metadata: { machineId: 'm1', path: '/repo/app', homeDir: '/home/me' },
                }),
            } as any,
            { m1: { metadata: { displayName: 'Laptop', homeDir: '/home/me' } } } as any,
            {},
            () => null,
            false,
            officialThreads,
        );

        const projectItems = items.filter((item) => item.type === 'project-group');
        expect(projectItems).toHaveLength(1);
        expect(projectItems[0].project.officialCodexThreads.map((thread) => thread.codexThreadId)).toEqual([
            'thread-7',
            'thread-6',
            'thread-5',
            'thread-4',
            'thread-3',
            'thread-2',
            'thread-1',
        ]);
    });

    it('groups projects by machine instead of interleaving machines by project recency', () => {
        const items = buildProjectListViewData(
            {
                m1Old: session({
                    id: 'm1Old',
                    active: true,
                    createdAt: 100,
                    metadata: { machineId: 'm1', path: '/repo/old' },
                }),
                m2New: session({
                    id: 'm2New',
                    active: true,
                    createdAt: 300,
                    metadata: { machineId: 'm2', path: '/repo/new' },
                }),
                m1Mid: session({
                    id: 'm1Mid',
                    active: true,
                    createdAt: 200,
                    metadata: { machineId: 'm1', path: '/repo/mid' },
                }),
            } as any,
            {
                m1: { metadata: { displayName: 'Laptop' } },
                m2: { metadata: { displayName: 'Server' } },
            } as any,
            {},
            () => null,
            false,
        );

        expect(items.map(item => item.type === 'machine-separator' ? item.machineName : item.project.key)).toEqual([
            'Server',
            'm2:/repo/new',
            'Laptop',
            'm1:/repo/mid',
            'm1:/repo/old',
        ]);
    });
});
