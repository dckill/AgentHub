import { describe, expect, it, vi } from 'vitest';
import { runSideChatCloseLifecycle } from './sideChatCloseLifecycle';

describe('side chat close lifecycle', () => {
    it('stops before closing the next side chat after account switch', async () => {
        const ids = ['old-side-1', 'old-side-2'];
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValue(false);
        const closeSession = vi.fn(async () => undefined);
        const refreshSessions = vi.fn(async () => undefined);

        const closed = await runSideChatCloseLifecycle({ ids, closeSession, isCurrent, refreshSessions });

        expect(closed).toBe(false);
        expect(closeSession).toHaveBeenCalledTimes(1);
        expect(closeSession).toHaveBeenCalledWith(ids[0], expect.any(Function));
        expect(refreshSessions).not.toHaveBeenCalled();
    });

    it('skips refresh when a close callback reports stale work', async () => {
        const refreshSessions = vi.fn(async () => undefined);

        const closed = await runSideChatCloseLifecycle({
            ids: ['old-side-1'],
            closeSession: vi.fn(async () => false),
            isCurrent: () => true,
            refreshSessions,
        });

        expect(closed).toBe(false);
        expect(refreshSessions).not.toHaveBeenCalled();
    });

    it('refreshes only after all side chats close while current', async () => {
        const closeSession = vi.fn(async () => undefined);
        const refreshSessions = vi.fn(async () => undefined);

        const closed = await runSideChatCloseLifecycle({
            ids: ['side-1', 'side-2'],
            closeSession,
            isCurrent: () => true,
            refreshSessions,
        });

        expect(closed).toBe(true);
        expect(closeSession).toHaveBeenCalledTimes(2);
        expect(refreshSessions).toHaveBeenCalledOnce();
    });
});
