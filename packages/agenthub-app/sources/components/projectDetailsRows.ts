import type { ProjectGroupData } from '@/sync/storageProjection';

export interface ProjectDetailLabels {
    machine: string;
    path: string;
    projectKey: string;
    status: string;
    visible: string;
    hidden: string;
    branch: string;
    worktree: string;
    activeSessionCount: string;
    archivedSessionCount: string;
    computerSessionCount: string;
    gitChanges: string;
    noGitChanges: string;
    notAvailable: string;
    enabled: string;
}

export type ProjectDetailRowId =
    | 'machine'
    | 'path'
    | 'projectKey'
    | 'status'
    | 'branch'
    | 'worktree'
    | 'activeSessionCount'
    | 'archivedSessionCount'
    | 'computerSessionCount'
    | 'gitChanges';

export interface ProjectDetailRow {
    id: ProjectDetailRowId;
    icon: string;
    label: string;
    value: string;
}

export function buildProjectDetailRows(project: ProjectGroupData, labels: ProjectDetailLabels): ProjectDetailRow[] {
    const gitChanges = project.linesAdded > 0 || project.linesRemoved > 0
        ? `+${project.linesAdded} / -${project.linesRemoved}`
        : labels.noGitChanges;

    return [
        {
            id: 'machine',
            icon: 'desktop-outline',
            label: labels.machine,
            value: project.machineName,
        },
        {
            id: 'path',
            icon: 'folder-outline',
            label: labels.path,
            value: project.displayPath,
        },
        {
            id: 'projectKey',
            icon: 'finger-print-outline',
            label: labels.projectKey,
            value: project.key,
        },
        {
            id: 'status',
            icon: project.archived ? 'eye-off-outline' : 'eye-outline',
            label: labels.status,
            value: project.archived ? labels.hidden : labels.visible,
        },
        {
            id: 'branch',
            icon: 'git-branch-outline',
            label: labels.branch,
            value: project.branch || labels.notAvailable,
        },
        {
            id: 'worktree',
            icon: 'git-compare-outline',
            label: labels.worktree,
            value: project.worktreeName || (project.isWorktree ? labels.enabled : labels.notAvailable),
        },
        {
            id: 'activeSessionCount',
            icon: 'play-circle-outline',
            label: labels.activeSessionCount,
            value: String(project.activeSessions.length),
        },
        {
            id: 'archivedSessionCount',
            icon: 'archive-outline',
            label: labels.archivedSessionCount,
            value: String(project.archivedSessions.length),
        },
        {
            id: 'computerSessionCount',
            icon: 'desktop-outline',
            label: labels.computerSessionCount,
            value: String(project.officialCodexThreads.length),
        },
        {
            id: 'gitChanges',
            icon: 'stats-chart-outline',
            label: labels.gitChanges,
            value: gitChanges,
        },
    ];
}
