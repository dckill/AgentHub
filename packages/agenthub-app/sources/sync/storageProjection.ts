import { Session, Machine, GitStatus } from './storageTypes';
import { getSessionName, getSessionSubtitle, type SessionState } from '@/utils/sessionUtils';
import { getDefaultProjectIcon, buildProjectKey, normalizeProjectPath } from '@/utils/projectIcons';
import type { OfficialCodexThread } from './officialThreads';
import { isPathInProjectScope } from './sessionWorkbench';
import { isTopLevelSession } from './sideChatSessions';

export function resolveSessionOnlineState(session: { active: boolean; activeAt: number }): 'online' | number {
    return session.active ? 'online' : session.activeAt;
}

export function isSessionActive(session: { active: boolean; activeAt: number }): boolean {
    return session.active;
}

export function isSandboxEnabled(metadata: Session['metadata'] | null | undefined): boolean {
    const sandbox = metadata?.sandbox;
    return !!sandbox && typeof sandbox === 'object' && (sandbox as { enabled?: unknown }).enabled === true;
}

export interface SessionRowData {
    id: string;
    name: string;
    subtitle: string;
    flavor: string | null;
    state: SessionState;
    activeAt?: number;
    createdAt?: number;
    hasDraft: boolean;
    active: boolean;
    machineId: string | null;
    path: string | null;
    homeDir: string | null;
    completedTodosCount: number;
    totalTodosCount: number;
    hasUnviewedCompletion: boolean;
    source?: 'agenthub' | 'official-codex' | 'official-claude';
    codexThreadId?: string | null;
    claudeSessionId?: string | null;
    officialSourceLabel?: 'codex' | 'claude';
}

export interface SessionRowViewState {
    lastViewedAt?: number;
    unviewedCompletionAt?: number;
}

export interface SessionRowViewStateMap {
    sessionLastViewedAt?: Record<string, number>;
    sessionUnviewedCompletionAt?: Record<string, number>;
}

export type SessionListViewItem =
    | { type: 'header'; title: string }
    | { type: 'active-sessions'; sessions: SessionRowData[] }
    | { type: 'archive-toggle'; hidden: boolean }
    | { type: 'project-group'; displayPath: string; machine: Machine }
    | { type: 'session'; session: SessionRowData };

export type SessionListItem = string | Session;

export interface ProjectGroupData {
    key: string;
    icon: string;
    displayName: string;
    path: string;
    displayPath: string;
    machineId: string;
    machineName: string;
    branch: string | null;
    isWorktree: boolean;
    worktreeName: string | null;
    linesAdded: number;
    linesRemoved: number;
    archived: boolean;
    activeSessions: SessionRowData[];
    archivedSessions: SessionRowData[];
    officialCodexThreads: SessionRowData[];
}

export type ProjectListViewItem =
    | { type: 'machine-separator'; machineName: string; machineId: string }
    | { type: 'project-group'; project: ProjectGroupData };

export function buildSessionRowData(session: Session, viewState: SessionRowViewState = {}): SessionRowData {
    const isOnline = session.presence === 'online';
    const hasPermissions = !!(session.agentState?.requests && Object.keys(session.agentState.requests).length > 0);

    let state: SessionState;
    if (!isOnline) {
        state = 'disconnected';
    } else if (hasPermissions) {
        state = 'permission_required';
    } else if (session.thinking) {
        state = 'thinking';
    } else {
        state = 'waiting';
    }

    const lastViewedAt = viewState.lastViewedAt ?? 0;
    const hasUnviewedCompletion = session.active
        && state === 'waiting'
        && (viewState.unviewedCompletionAt ?? 0) > lastViewedAt;

    return {
        id: session.id,
        name: getSessionName(session),
        subtitle: getSessionSubtitle(session),
        flavor: session.metadata?.flavor ?? null,
        state,
        ...(!session.active && { activeAt: session.activeAt, createdAt: session.createdAt }),
        hasDraft: !!session.draft,
        active: session.active,
        machineId: session.metadata?.machineId ?? null,
        path: session.metadata?.path ?? null,
        homeDir: session.metadata?.homeDir ?? null,
        completedTodosCount: session.todos?.filter(todo => todo.status === 'completed').length ?? 0,
        totalTodosCount: session.todos?.length ?? 0,
        hasUnviewedCompletion,
        source: 'agenthub',
        codexThreadId: session.metadata?.codexThreadId ?? null,
    };
}

function getSessionRowViewState(sessionId: string, viewStateMap?: SessionRowViewStateMap): SessionRowViewState {
    return {
        lastViewedAt: viewStateMap?.sessionLastViewedAt?.[sessionId],
        unviewedCompletionAt: viewStateMap?.sessionUnviewedCompletionAt?.[sessionId],
    };
}

export function buildOfficialCodexThreadRowData(
    thread: OfficialCodexThread,
    homeDir?: string | null,
): SessionRowData {
    const provider = thread.provider ?? 'codex';
    return {
        id: `official-${provider}:${thread.machineId}:${thread.id}`,
        name: thread.title,
        subtitle: homeDir && thread.cwd.startsWith(homeDir)
            ? `~${thread.cwd.slice(homeDir.length)}`
            : thread.cwd,
        flavor: provider,
        state: 'waiting',
        activeAt: thread.updatedAt,
        createdAt: thread.createdAt ?? thread.updatedAt,
        hasDraft: false,
        active: true,
        machineId: thread.machineId,
        path: thread.cwd,
        homeDir: homeDir ?? null,
        completedTodosCount: 0,
        totalTodosCount: 0,
        hasUnviewedCompletion: false,
        source: provider === 'claude' ? 'official-claude' : 'official-codex',
        codexThreadId: provider === 'codex' ? thread.id : null,
        claudeSessionId: provider === 'claude' ? thread.id : null,
        officialSourceLabel: provider,
    };
}

export function buildSessionListViewData(
    sessions: Record<string, Session>,
    hideInactiveSessions: boolean = false,
    viewStateMap?: SessionRowViewStateMap,
): SessionListViewItem[] {
    const activeSessions: Session[] = [];
    const inactiveSessions: Session[] = [];

    Object.values(sessions).forEach(session => {
        if (!isTopLevelSession(session)) return;
        if (isSessionActive(session)) {
            activeSessions.push(session);
        } else if (!hideInactiveSessions) {
            inactiveSessions.push(session);
        }
    });

    activeSessions.sort((a, b) => b.createdAt - a.createdAt);
    inactiveSessions.sort((a, b) => b.createdAt - a.createdAt);

    const listData: SessionListViewItem[] = [];

    if (activeSessions.length > 0) {
        listData.push({
            type: 'active-sessions',
            sessions: activeSessions.map(session => buildSessionRowData(session, getSessionRowViewState(session.id, viewStateMap))),
        });
    }

    if (inactiveSessions.length > 0) {
        listData.push({ type: 'archive-toggle', hidden: hideInactiveSessions });
    }

    if (hideInactiveSessions) {
        return listData;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    let currentDateString = '';
    let currentDateGroup: Session[] = [];

    const flushCurrentGroup = () => {
        if (currentDateGroup.length === 0 || !currentDateString) {
            return;
        }

        const groupDate = new Date(currentDateString);
        const sessionDateOnly = new Date(groupDate.getFullYear(), groupDate.getMonth(), groupDate.getDate());

        let headerTitle: string;
        if (sessionDateOnly.getTime() === today.getTime()) {
            headerTitle = 'Today';
        } else if (sessionDateOnly.getTime() === yesterday.getTime()) {
            headerTitle = 'Yesterday';
        } else {
            const diffTime = today.getTime() - sessionDateOnly.getTime();
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            headerTitle = `${diffDays} days ago`;
        }

        listData.push({ type: 'header', title: headerTitle });
        currentDateGroup.forEach(session => {
            listData.push({
                type: 'session',
                session: buildSessionRowData(session, getSessionRowViewState(session.id, viewStateMap)),
            });
        });
    };

    for (const session of inactiveSessions) {
        const sessionDate = new Date(session.createdAt);
        const dateString = sessionDate.toDateString();

        if (dateString !== currentDateString) {
            flushCurrentGroup();
            currentDateString = dateString;
            currentDateGroup = [session];
        } else {
            currentDateGroup.push(session);
        }
    }

    flushCurrentGroup();
    return listData;
}

export function buildProjectListViewData(
    sessions: Record<string, Session>,
    machines: Record<string, Machine>,
    projectCustomizations: Record<string, { name?: string; icon?: string; archived?: boolean }>,
    getSessionProjectGitStatus: (sessionId: string) => GitStatus | null,
    hideInactiveSessions: boolean,
    officialCodexThreads: OfficialCodexThread[] = [],
    viewStateMap?: SessionRowViewStateMap,
): ProjectListViewItem[] {
    type SessionGroup = { machineId: string; path: string; sessions: Session[]; officialCodexThreads: OfficialCodexThread[] };
    type ProjectGroupListEntry = { project: ProjectGroupData; latestAt: number };
    const groupMap = new Map<string, SessionGroup>();

    const findBestGroupForOfficialThread = (machineId: string, cwd: string): SessionGroup | null => {
        let bestGroup: SessionGroup | null = null;
        for (const group of groupMap.values()) {
            if (group.machineId !== machineId) {
                continue;
            }
            if (!isPathInProjectScope(cwd, group.path)) {
                continue;
            }
            if (!bestGroup || group.path.length > bestGroup.path.length) {
                bestGroup = group;
            }
        }
        return bestGroup;
    };

    const findBestCustomizedProjectPath = (machineId: string, cwd: string): string | null => {
        let bestPath: string | null = null;
        for (const key of Object.keys(projectCustomizations)) {
            const separatorIndex = key.indexOf(':');
            if (separatorIndex <= 0) {
                continue;
            }
            const customMachineId = key.slice(0, separatorIndex);
            if (customMachineId !== machineId) {
                continue;
            }
            const customPath = normalizeProjectPath(key.slice(separatorIndex + 1));
            if (!isPathInProjectScope(cwd, customPath)) {
                continue;
            }
            if (!bestPath || customPath.length > bestPath.length) {
                bestPath = customPath;
            }
        }
        return bestPath;
    };

    for (const session of Object.values(sessions)) {
        if (!isTopLevelSession(session)) continue;
        if (hideInactiveSessions && !session.active) continue;

        const machineId = session.metadata?.machineId;
        const path = session.metadata?.path;
        if (!machineId || !path) continue;

        const normalizedPath = normalizeProjectPath(path);
        const key = buildProjectKey(machineId, normalizedPath);
        let group = groupMap.get(key);
        if (!group) {
            group = { machineId, path: normalizedPath, sessions: [], officialCodexThreads: [] };
            groupMap.set(key, group);
        }
        group.sessions.push(session);
    }

    for (const thread of officialCodexThreads) {
        if (thread.archived) continue;

        const normalizedPath = normalizeProjectPath(thread.cwd);
        let group = findBestGroupForOfficialThread(thread.machineId, normalizedPath);
        if (!group) {
            const customizedProjectPath = findBestCustomizedProjectPath(thread.machineId, normalizedPath);
            if (!customizedProjectPath) {
                continue;
            }

            const key = buildProjectKey(thread.machineId, customizedProjectPath);
            group = { machineId: thread.machineId, path: customizedProjectPath, sessions: [], officialCodexThreads: [] };
            groupMap.set(key, group);
        }

        const provider = thread.provider ?? 'codex';
        const existsInAgentHub = group.sessions.some((session) => session.active && (provider === 'claude'
            ? session.metadata?.claudeSessionId === thread.id
            : session.metadata?.codexThreadId === thread.id));
        if (!existsInAgentHub) {
            group.officialCodexThreads.push(thread);
        }
    }

    const getGroupLatestAt = (group: SessionGroup): number => {
        const times = [
            ...group.sessions.map(s => s.createdAt),
            ...group.officialCodexThreads.map(t => t.updatedAt),
        ];
        return Math.max(...times, 0);
    };

    const groups = Array.from(groupMap.values())
        .map(group => ({ group, latestAt: getGroupLatestAt(group) }))
        .sort((a, b) => b.latestAt - a.latestAt);

    const listData: ProjectListViewItem[] = [];
    const projectsByMachine = new Map<string, ProjectGroupListEntry[]>();

    for (const { group, latestAt } of groups) {
        const machine = machines[group.machineId];
        const machineName = machine?.metadata?.displayName || machine?.metadata?.host || group.machineId;

        const key = buildProjectKey(group.machineId, group.path);
        const custom = projectCustomizations[key];
        const pathParts = group.path.split('/').filter(Boolean);
        const folderName = pathParts[pathParts.length - 1] || group.path;
        const displayName = custom?.name || folderName;
        const icon = custom?.icon || getDefaultProjectIcon(group.path);
        const homeDir = group.sessions[0]?.metadata?.homeDir ?? machine?.metadata?.homeDir;
        const displayPath = homeDir
            ? group.path.startsWith(homeDir)
                ? '~' + group.path.slice(homeDir.length)
                : group.path
            : group.path;

        const activeSessions: SessionRowData[] = [];
        const archivedSessions: SessionRowData[] = [];
        const officialThreadRows: SessionRowData[] = [];
        for (const session of group.sessions) {
            const rowData = buildSessionRowData(session, getSessionRowViewState(session.id, viewStateMap));
            if (session.active) {
                activeSessions.push(rowData);
            } else {
                archivedSessions.push(rowData);
            }
        }
        for (const thread of group.officialCodexThreads) {
            officialThreadRows.push(buildOfficialCodexThreadRowData(thread, machine?.metadata?.homeDir ?? null));
        }

        activeSessions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        archivedSessions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        officialThreadRows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        if (custom?.archived) {
            continue;
        }

        const refSession = activeSessions[0] || officialThreadRows[0] || archivedSessions[0];
        const gitStatus = refSession ? getSessionProjectGitStatus(refSession.id) : null;
        const worktreeMarker = '/.dev/worktree/';
        const wtIndex = group.path.indexOf(worktreeMarker);
        const isWorktree = wtIndex !== -1;
        const worktreeName = isWorktree ? group.path.slice(wtIndex + worktreeMarker.length) : null;

        const machineProjects = projectsByMachine.get(group.machineId) ?? [];
        machineProjects.push({
            latestAt,
            project: {
                key,
                icon,
                displayName,
                path: group.path,
                displayPath,
                machineId: group.machineId,
                machineName,
                branch: gitStatus?.branch ?? null,
                isWorktree,
                worktreeName,
                linesAdded: gitStatus?.unstagedLinesAdded ?? 0,
                linesRemoved: gitStatus?.unstagedLinesRemoved ?? 0,
                archived: custom?.archived === true,
                activeSessions,
                archivedSessions,
                officialCodexThreads: officialThreadRows,
            },
        });
        projectsByMachine.set(group.machineId, machineProjects);
    }

    const machineGroups = Array.from(projectsByMachine.entries())
        .map(([machineId, projects]) => ({
            machineId,
            projects: projects.sort((a, b) => b.latestAt - a.latestAt),
            latestAt: Math.max(...projects.map(project => project.latestAt), 0),
        }))
        .sort((a, b) => b.latestAt - a.latestAt);

    for (const machineGroup of machineGroups) {
        const firstProject = machineGroup.projects[0]?.project;
        if (!firstProject) {
            continue;
        }

        listData.push({
            type: 'machine-separator',
            machineId: machineGroup.machineId,
            machineName: firstProject.machineName,
        });

        for (const entry of machineGroup.projects) {
            listData.push({
                type: 'project-group',
                project: entry.project,
            });
        }
    }

    return listData;
}
