import { describe, expect, it, vi } from 'vitest';

vi.mock('./officialThreads', () => ({
    listOfficialCodexThreadStates: vi.fn(),
}));

vi.mock('./ops', () => ({
    sessionArchive: vi.fn(),
}));

import {
    archiveArchivedOfficialCodexMirrorsForMachine,
    buildActiveCodexMirrorSyncKey,
} from './officialArchiveSync';
import type { Session } from './storageTypes';

function session(
    id: string,
    options: {
        active?: boolean;
        machineId?: string;
        codexThreadId?: string;
        lifecycleState?: string;
    },
): Session {
    return {
        id,
        active: options.active ?? true,
        metadata: {
            path: '/repo',
            host: 'host',
            homeDir: '/home/me',
            machineId: options.machineId,
            codexThreadId: options.codexThreadId,
            lifecycleState: options.lifecycleState,
            flavor: 'codex',
        },
    } as Session;
}

describe('officialArchiveSync', () => {
    it('archives active AgentHub sessions whose official Codex thread is archived', async () => {
        const sessions = {
            s1: session('s1', { machineId: 'm1', codexThreadId: 'thread-1' }),
            s2: session('s2', { machineId: 'm1', codexThreadId: 'thread-2' }),
            s3: session('s3', { machineId: 'm2', codexThreadId: 'thread-3' }),
            inactive: session('inactive', { active: false, machineId: 'm1', codexThreadId: 'thread-4' }),
        };
        const listThreadStates = vi.fn().mockResolvedValue([
            { id: 'thread-1', archived: true },
            { id: 'thread-2', archived: false },
        ]);
        const archiveSession = vi.fn().mockResolvedValue({ success: true });

        const result = await archiveArchivedOfficialCodexMirrorsForMachine('m1', sessions, {
            listThreadStates,
            archiveSession,
        });

        expect(listThreadStates).toHaveBeenCalledWith('m1', ['thread-1', 'thread-2']);
        expect(archiveSession).toHaveBeenCalledWith('s1');
        expect(archiveSession).toHaveBeenCalledTimes(1);
        expect(result).toEqual({ checkedThreadCount: 2, archivedSessionCount: 1 });
    });

    it('does not archive sessions when official state lookup fails', async () => {
        const sessions = {
            s1: session('s1', { machineId: 'm1', codexThreadId: 'thread-1' }),
        };
        const archiveSession = vi.fn().mockResolvedValue({ success: true });

        await expect(archiveArchivedOfficialCodexMirrorsForMachine('m1', sessions, {
            listThreadStates: vi.fn().mockRejectedValue(new Error('offline')),
            archiveSession,
        })).rejects.toThrow('offline');
        expect(archiveSession).not.toHaveBeenCalled();
    });

    it('builds a stable sync key for active Codex mirrors only', () => {
        const key = buildActiveCodexMirrorSyncKey({
            s2: session('s2', { machineId: 'm1', codexThreadId: 'thread-2' }),
            s1: session('s1', { machineId: 'm1', codexThreadId: 'thread-1' }),
            inactive: session('inactive', { active: false, machineId: 'm1', codexThreadId: 'thread-3' }),
            archived: session('archived', { machineId: 'm1', codexThreadId: 'thread-4', lifecycleState: 'archived' }),
        });

        expect(key).toBe('m1:thread-1:s1|m1:thread-2:s2');
    });
});
