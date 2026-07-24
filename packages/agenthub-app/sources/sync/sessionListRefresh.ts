import type {
    ListOfficialCodexThreadsOptions,
    OfficialCodexThread,
} from './officialThreads';
import type { Machine, Session } from './storageTypes';
import type { ProjectListViewItem } from './storageProjection';
import { buildOfficialDiscoveryScopes, isPathInProjectScope } from './sessionWorkbench';

type RefreshOfficialThreadsDependencies = {
    listOfficialThreads?: (machineId: string, options: ListOfficialCodexThreadsOptions) => Promise<OfficialCodexThread[]>;
    applyOfficialThreads?: (machineId: string, threads: OfficialCodexThread[]) => void;
    archiveOfficialMirrors?: (machineId: string, sessions: Record<string, Session>) => Promise<unknown>;
};

type RefreshOfficialThreadsInput = RefreshOfficialThreadsDependencies & {
    projectItems: ProjectListViewItem[] | null;
    machines: Machine[];
    sessions?: Record<string, Session>;
};

type RefreshProjectSessionListInput = {
    projectItems: ProjectListViewItem[] | null;
    machines: Machine[];
    refreshSessions?: () => Promise<unknown>;
    refreshMachines?: () => Promise<unknown>;
    invalidateGitStatus?: (sessionId: string) => void;
    refreshOfficialThreads?: (input: { projectItems: ProjectListViewItem[] | null; machines: Machine[] }) => Promise<unknown>;
};

export function collectProjectSessionIds(projectItems: ProjectListViewItem[] | null): string[] {
    if (!projectItems) {
        return [];
    }

    const sessionIds: string[] = [];
    for (const item of projectItems) {
        if (item.type !== 'project-group') {
            continue;
        }

        const session = item.project.activeSessions[0] ?? item.project.archivedSessions[0];
        if (session?.id) {
            sessionIds.push(session.id);
        }
    }

    return sessionIds;
}

export function buildOfficialDiscoveryScopesForProjectList(
    projectItems: ProjectListViewItem[] | null,
    machines: Machine[],
) {
    if (!projectItems) {
        return [];
    }

    const activeMachineIds = new Set(
        machines
            .filter((machine) => machine.active)
            .map((machine) => machine.id),
    );

    return buildOfficialDiscoveryScopes(
        projectItems
            .filter((item) => item.type === 'project-group')
            .map((item) => ({
                machineId: item.project.machineId,
                path: item.project.path,
            })),
        activeMachineIds,
    );
}

export async function refreshOfficialThreadsForProjectList(input: RefreshOfficialThreadsInput): Promise<void> {
    const listOfficialThreads = input.listOfficialThreads ?? (await import('./officialThreads')).listOfficialCodexThreads;
    const storageModule = input.applyOfficialThreads && input.sessions ? null : await import('./storage');
    const applyOfficialThreads = input.applyOfficialThreads ?? ((machineId, threads) => {
        storageModule!.storage.getState().applyOfficialCodexThreads(machineId, threads);
    });
    const archiveOfficialMirrors = input.archiveOfficialMirrors ?? (await import('./officialArchiveSync')).archiveArchivedOfficialCodexMirrorsForMachine;
    const sessions = input.sessions ?? storageModule!.storage.getState().sessions;
    const scopes = buildOfficialDiscoveryScopesForProjectList(input.projectItems, input.machines);
    const scopesByMachineId = new Map(scopes.map((scope) => [scope.machineId, scope]));

    for (const machine of input.machines) {
        if (!machine.active) {
            continue;
        }

        const hasOfficialSessionSource = machine.metadata?.cliAvailability?.codex || machine.metadata?.cliAvailability?.claude;
        if (!hasOfficialSessionSource) {
            continue;
        }

        const scope = scopesByMachineId.get(machine.id);
        if (!scope || scope.paths.length === 0) {
            continue;
        }

        try {
            const threads = await listOfficialThreads(machine.id, {
                paths: scope.paths,
                providers: ['codex', 'claude'],
                limit: 50,
            });
            const scopedThreads = threads.filter((thread) => scope.paths.some((path) => isPathInProjectScope(thread.cwd, path)));
            applyOfficialThreads(machine.id, scopedThreads);

            if (machine.metadata?.cliAvailability?.codex) {
                await archiveOfficialMirrors(machine.id, sessions);
            }
        } catch (error) {
            console.warn(`Failed to refresh official threads for machine ${machine.id}; keeping the last successful list`, error);
        }
    }
}

export async function refreshProjectSessionList(input: RefreshProjectSessionListInput): Promise<void> {
    const syncModule = input.refreshSessions && input.refreshMachines ? null : await import('./sync');
    const refreshSessions = input.refreshSessions ?? syncModule!.sync.refreshSessions;
    const refreshMachines = input.refreshMachines ?? syncModule!.sync.refreshMachines;
    const gitStatusModule = input.invalidateGitStatus ? null : await import('./gitStatusSync');
    const invalidateGitStatus = input.invalidateGitStatus ?? ((sessionId) => {
        gitStatusModule!.gitStatusSync.getSync(sessionId).invalidate();
    });
    const refreshOfficialThreads = input.refreshOfficialThreads ?? ((refreshInput) => refreshOfficialThreadsForProjectList(refreshInput));

    await Promise.all([
        refreshSessions(),
        refreshMachines(),
    ]);

    for (const sessionId of collectProjectSessionIds(input.projectItems)) {
        invalidateGitStatus(sessionId);
    }

    await refreshOfficialThreads({
        projectItems: input.projectItems,
        machines: input.machines,
    });
}
