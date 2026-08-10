import type { Session } from './storageTypes';
import { listOfficialCodexThreadStates, type OfficialCodexThreadState } from './officialThreads';
import { sessionArchive } from './ops';

type ArchiveSessionResult = { success: boolean; message?: string };

type ArchiveOfficialCodexMirrorsOptions = {
    listThreadStates?: (machineId: string, threadIds: string[]) => Promise<OfficialCodexThreadState[]>;
    archiveSession?: (sessionId: string) => Promise<ArchiveSessionResult>;
    isCurrent?: () => boolean;
};

type CodexMirrorSession = {
    sessionId: string;
    machineId: string;
    threadId: string;
};

export function buildActiveCodexMirrorSyncKey(sessions: Record<string, Session>): string {
    return selectActiveCodexMirrorSessions(sessions)
        .map((mirror) => `${mirror.machineId}:${mirror.threadId}:${mirror.sessionId}`)
        .sort()
        .join('|');
}

export function selectActiveCodexMirrorSessions(
    sessions: Record<string, Session>,
    machineId?: string,
): CodexMirrorSession[] {
    return Object.values(sessions).flatMap((session) => {
        if (!session.active) {
            return [];
        }
        if (session.metadata?.lifecycleState === 'archived') {
            return [];
        }
        const sessionMachineId = session.metadata?.machineId;
        if (!sessionMachineId) {
            return [];
        }
        if (machineId && sessionMachineId !== machineId) {
            return [];
        }
        const threadId = session.metadata?.codexThreadId;
        if (!threadId) {
            return [];
        }
        return [{ sessionId: session.id, machineId: sessionMachineId, threadId }];
    });
}

export async function archiveArchivedOfficialCodexMirrorsForMachine(
    machineId: string,
    sessions: Record<string, Session>,
    options: ArchiveOfficialCodexMirrorsOptions = {},
): Promise<{ checkedThreadCount: number; archivedSessionCount: number }> {
    const isCurrent = options.isCurrent ?? (() => true);
    const mirrors = selectActiveCodexMirrorSessions(sessions, machineId);
    const threadIds = Array.from(new Set(mirrors.map((mirror) => mirror.threadId)));
    if (threadIds.length === 0) {
        return { checkedThreadCount: 0, archivedSessionCount: 0 };
    }
    if (!isCurrent()) {
        return { checkedThreadCount: 0, archivedSessionCount: 0 };
    }

    const listThreadStates = options.listThreadStates ?? listOfficialCodexThreadStates;
    const archiveSessionFn = options.archiveSession ?? sessionArchive;
    const threadStates = await listThreadStates(machineId, threadIds);
    if (!isCurrent()) {
        return { checkedThreadCount: threadIds.length, archivedSessionCount: 0 };
    }
    const archivedThreadIds = new Set(
        threadStates
            .filter((threadState) => threadState.archived)
            .map((threadState) => threadState.id),
    );

    let archivedSessionCount = 0;
    for (const mirror of mirrors) {
        if (!isCurrent()) {
            return { checkedThreadCount: threadIds.length, archivedSessionCount };
        }
        if (!archivedThreadIds.has(mirror.threadId)) {
            continue;
        }

        try {
            const result = await archiveSessionFn(mirror.sessionId);
            if (isCurrent() && result.success) {
                archivedSessionCount += 1;
            }
        } catch {
            // Keep syncing other mirrored sessions; the next poll can retry this one.
        }
    }

    return { checkedThreadCount: threadIds.length, archivedSessionCount };
}
