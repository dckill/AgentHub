import { describe, expect, it, vi } from 'vitest';
import { runProjectSessionArchiveLifecycle } from './projectSessionArchiveLifecycle';

describe('project session archive lifecycle', () => {
    it('stops before the next session when the account changes during archival', async () => {
        const sessions = [{ id: 'old-1' }, { id: 'old-2' }];
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValue(false);
        const archiveSession = vi.fn(async () => undefined);
        const refreshSessions = vi.fn(async () => undefined);

        const archived = await runProjectSessionArchiveLifecycle({
            sessions,
            archiveSession,
            isCurrent,
            refreshSessions,
        });

        expect(archived).toBe(false);
        expect(archiveSession).toHaveBeenCalledTimes(1);
        expect(archiveSession).toHaveBeenCalledWith(sessions[0], expect.any(Function));
        expect(refreshSessions).not.toHaveBeenCalled();
    });

    it('does not refresh after the final archive becomes stale', async () => {
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValue(false);
        const refreshSessions = vi.fn(async () => undefined);

        const archived = await runProjectSessionArchiveLifecycle({
            sessions: [{ id: 'old-1' }],
            archiveSession: vi.fn(async () => undefined),
            isCurrent,
            refreshSessions,
        });

        expect(archived).toBe(false);
        expect(refreshSessions).not.toHaveBeenCalled();
    });

    it('stops and skips refresh when a session archive reports stale work', async () => {
        const refreshSessions = vi.fn(async () => undefined);

        const archived = await runProjectSessionArchiveLifecycle({
            sessions: [{ id: 'old-1' }],
            archiveSession: vi.fn(async () => false),
            isCurrent: () => true,
            refreshSessions,
        });

        expect(archived).toBe(false);
        expect(refreshSessions).not.toHaveBeenCalled();
    });
});
