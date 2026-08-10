import { describe, expect, it, vi } from 'vitest';
import { runWorktreeMergePostSpawnLifecycle } from './worktreeMergeLifecycle';

describe('worktree merge post-spawn lifecycle', () => {
    it('stops before applying the new session when refresh becomes stale', async () => {
        const applyPermission = vi.fn();
        const sendMergeMessage = vi.fn(async () => undefined);
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValue(false);

        const completed = await runWorktreeMergePostSpawnLifecycle({
            isCurrent,
            refreshSessions: vi.fn(async () => undefined),
            applyPermission,
            sendMergeMessage,
            confirmArchive: vi.fn(async () => false),
            archiveOriginal: vi.fn(async () => undefined),
            navigate: vi.fn(),
        });

        expect(completed).toBe(false);
        expect(applyPermission).not.toHaveBeenCalled();
        expect(sendMergeMessage).not.toHaveBeenCalled();
    });

    it('stops before archive and navigation when confirmation returns after account switch', async () => {
        let current = true;
        const archiveOriginal = vi.fn(async () => undefined);
        const navigate = vi.fn();

        const completed = await runWorktreeMergePostSpawnLifecycle({
            isCurrent: () => current,
            refreshSessions: vi.fn(async () => undefined),
            applyPermission: vi.fn(),
            sendMergeMessage: vi.fn(async () => undefined),
            confirmArchive: vi.fn(async () => {
                current = false;
                return true;
            }),
            archiveOriginal,
            navigate,
        });

        expect(completed).toBe(false);
        expect(archiveOriginal).not.toHaveBeenCalled();
        expect(navigate).not.toHaveBeenCalled();
    });

    it('keeps the original order for a current merge and optional archive', async () => {
        const events: string[] = [];

        const completed = await runWorktreeMergePostSpawnLifecycle({
            isCurrent: () => true,
            refreshSessions: vi.fn(async () => { events.push('refresh'); }),
            applyPermission: vi.fn(() => { events.push('permission'); }),
            sendMergeMessage: vi.fn(async () => { events.push('message'); }),
            confirmArchive: vi.fn(async () => { events.push('confirm'); return true; }),
            archiveOriginal: vi.fn(async () => { events.push('archive'); }),
            navigate: vi.fn(() => { events.push('navigate'); }),
        });

        expect(completed).toBe(true);
        expect(events).toEqual(['refresh', 'permission', 'message', 'confirm', 'archive', 'navigate']);
    });
});
