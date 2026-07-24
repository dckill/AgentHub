export type ProjectScope = {
    machineId: string;
    path: string;
};

export type OfficialProvider = 'codex' | 'claude';

export type OfficialCandidateKey = `${OfficialProvider}:${string}`;

export type OfficialCandidateLike = {
    id: string;
    provider: OfficialProvider;
    machineId: string;
    cwd?: string | null;
};

export function getOfficialCandidateKey(
    provider: OfficialProvider,
    externalId: string,
): OfficialCandidateKey {
    return `${provider}:${externalId}`;
}

function normalizePath(path: string): string {
    if (path === '/') {
        return '/';
    }
    return path.replace(/\/+$/u, '');
}

export function isPathInProjectScope(
    candidatePath: string | undefined | null,
    projectPath: string,
): boolean {
    if (!candidatePath) {
        return false;
    }

    const candidate = normalizePath(candidatePath);
    const project = normalizePath(projectPath);

    return candidate === project;
}

export function filterOfficialCandidatesForProject<T extends OfficialCandidateLike>(
    threads: readonly T[],
    scope: ProjectScope,
    hiddenKeys: ReadonlySet<string>,
    connectedKeys: ReadonlySet<string>,
): T[] {
    return threads.filter((thread) => {
        if (thread.machineId !== scope.machineId) {
            return false;
        }

        if (!isPathInProjectScope(thread.cwd, scope.path)) {
            return false;
        }

        const key = getOfficialCandidateKey(thread.provider, thread.id);

        return !hiddenKeys.has(key) && !connectedKeys.has(key);
    });
}

export type OfficialDiscoveryScope = {
    machineId: string;
    paths: string[];
};

export function buildOfficialDiscoveryScopes(
    projects: readonly ProjectScope[],
    activeMachineIds: ReadonlySet<string>,
): OfficialDiscoveryScope[] {
    const pathsByMachine = new Map<string, Set<string>>();

    for (const project of projects) {
        if (!activeMachineIds.has(project.machineId)) {
            continue;
        }

        const paths = pathsByMachine.get(project.machineId) ?? new Set<string>();
        paths.add(normalizePath(project.path));
        pathsByMachine.set(project.machineId, paths);
    }

    return Array.from(pathsByMachine.entries())
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([machineId, paths]) => ({
            machineId,
            paths: Array.from(paths).sort((left, right) => left.localeCompare(right)),
        }));
}
