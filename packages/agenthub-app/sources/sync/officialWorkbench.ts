import type { OfficialCodexThread } from './officialThreads';

export function getOfficialThreadWorkbenchId(thread: Pick<OfficialCodexThread, 'id' | 'provider'>): string {
    return (thread.provider ?? 'codex') === 'claude' ? `claude:${thread.id}` : thread.id;
}

export function removeOfficialThreadsFromList(
    threads: OfficialCodexThread[],
    officialIds: readonly string[],
): OfficialCodexThread[] {
    const ids = new Set(officialIds);
    return threads.filter((thread) => !ids.has(getOfficialThreadWorkbenchId(thread)));
}

export async function ignoreOfficialThreadsFromWorkbench(input: {
    machineId: string;
    officialIds: readonly string[];
    getThreads: (machineId: string) => OfficialCodexThread[];
    applyThreads: (machineId: string, threads: OfficialCodexThread[]) => void;
    ignoreThread?: (machineId: string, officialId: string) => Promise<void>;
    isCurrent?: () => boolean;
}): Promise<void> {
    const isCurrent = input.isCurrent ?? (() => true);
    const uniqueOfficialIds = Array.from(new Set(input.officialIds.filter(Boolean)));
    if (uniqueOfficialIds.length === 0) {
        return;
    }
    if (!isCurrent()) {
        return;
    }

    const previous = input.getThreads(input.machineId);
    const next = removeOfficialThreadsFromList(previous, uniqueOfficialIds);
    input.applyThreads(input.machineId, next);

    const ignoreThread = input.ignoreThread ?? (await import('./officialThreads')).ignoreOfficialCodexThread;
    try {
        for (const officialId of uniqueOfficialIds) {
            if (!isCurrent()) {
                return;
            }
            await ignoreThread(input.machineId, officialId);
        }
    } catch (error) {
        if (isCurrent()) {
            input.applyThreads(input.machineId, previous);
        }
        throw error;
    }
}
