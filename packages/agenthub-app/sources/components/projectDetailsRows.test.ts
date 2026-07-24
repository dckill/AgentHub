import { describe, expect, it } from 'vitest';
import { buildProjectDetailRows, type ProjectDetailLabels } from './projectDetailsRows';
import type { ProjectGroupData } from '@/sync/storageProjection';

const labels: ProjectDetailLabels = {
    machine: 'Machine',
    path: 'Path',
    projectKey: 'Project ID',
    status: 'Status',
    visible: 'Visible',
    hidden: 'Hidden',
    branch: 'Branch',
    worktree: 'Worktree',
    activeSessionCount: 'Active sessions',
    archivedSessionCount: 'Archived sessions',
    computerSessionCount: 'Computer sessions',
    gitChanges: 'Git changes',
    noGitChanges: 'No changes',
    notAvailable: 'Not available',
    enabled: 'Enabled',
};

function project(overrides: Partial<ProjectGroupData> = {}): ProjectGroupData {
    return {
        key: 'machine-1:/repo',
        icon: 'folder',
        displayName: 'repo',
        path: '/repo',
        displayPath: '~/repo',
        machineId: 'machine-1',
        machineName: 'Laptop',
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
    };
}

describe('buildProjectDetailRows', () => {
    it('does not include session-level agent flavors in project details', () => {
        const rows = buildProjectDetailRows(project({
            activeSessions: [{ id: 's1', flavor: 'codex' } as any],
            archivedSessions: [{ id: 's2', flavor: 'claude' } as any],
        }), labels);

        expect(rows.map(row => row.id)).not.toContain('agentTypes');
        expect(rows.map(row => row.value).join(' ')).not.toContain('Codex');
        expect(rows.map(row => row.value).join(' ')).not.toContain('Claude');
    });

    it('includes project-level and project-group attributes', () => {
        const rows = buildProjectDetailRows(project({
            archived: true,
            isWorktree: true,
            worktreeName: 'feature-a',
            linesAdded: 12,
            linesRemoved: 3,
            activeSessions: [{ id: 'active' } as any],
            archivedSessions: [{ id: 'archived' } as any],
            officialCodexThreads: [{ id: 'official' } as any],
        }), labels);

        expect(rows).toEqual([
            expect.objectContaining({ id: 'machine', value: 'Laptop' }),
            expect.objectContaining({ id: 'path', value: '~/repo' }),
            expect.objectContaining({ id: 'projectKey', value: 'machine-1:/repo' }),
            expect.objectContaining({ id: 'status', value: 'Hidden' }),
            expect.objectContaining({ id: 'branch', value: 'main' }),
            expect.objectContaining({ id: 'worktree', value: 'feature-a' }),
            expect.objectContaining({ id: 'activeSessionCount', value: '1' }),
            expect.objectContaining({ id: 'archivedSessionCount', value: '1' }),
            expect.objectContaining({ id: 'computerSessionCount', value: '1' }),
            expect.objectContaining({ id: 'gitChanges', value: '+12 / -3' }),
        ]);
    });
});
