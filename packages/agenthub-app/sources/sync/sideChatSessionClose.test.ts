import { describe, expect, it, vi } from 'vitest';
import { closeSideChatSession } from './sideChatSessionClose';

describe('closeSideChatSession', () => {
    it('does not archive a replacement-account session after kill becomes stale', async () => {
        let current = true;
        const killSession = vi.fn(async () => {
            current = false;
            return { success: false };
        });
        const archiveSession = vi.fn(async () => ({ success: true }));

        await expect(closeSideChatSession(
            'side-chat-1',
            () => current,
            killSession,
            archiveSession,
        )).resolves.toBe(false);

        expect(killSession).toHaveBeenCalledWith('side-chat-1');
        expect(archiveSession).not.toHaveBeenCalled();
    });

    it('archives after a failed kill while the originating account remains current', async () => {
        const killSession = vi.fn(async () => ({ success: false }));
        const archiveSession = vi.fn(async () => ({ success: true }));

        await expect(closeSideChatSession(
            'side-chat-1',
            () => true,
            killSession,
            archiveSession,
        )).resolves.toBe(true);

        expect(archiveSession).toHaveBeenCalledWith('side-chat-1');
    });
});
