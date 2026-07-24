import { describe, expect, it, vi } from 'vitest';
import { handleMissingSessionForUpdate, shouldRefreshMessagesForControlHandoff } from './sessionUpdateGuards';

describe('handleMissingSessionForUpdate', () => {
    it('quietly refreshes instead of logging an error for late new-message updates', () => {
        const fetchSessions = vi.fn();
        const error = vi.fn();
        const warn = vi.fn();

        const handled = handleMissingSessionForUpdate({
            sessionId: 'session-1',
            updateType: 'new-message',
            hasSession: true,
            hasEncryption: false,
            fetchSessions,
            logger: { error, warn },
        });

        expect(handled).toBe(true);
        expect(fetchSessions).toHaveBeenCalledTimes(1);
        expect(error).not.toHaveBeenCalled();
        expect(warn).not.toHaveBeenCalled();
    });
});

describe('shouldRefreshMessagesForControlHandoff', () => {
    it('refreshes when control returns from desktop to mobile', () => {
        expect(
            shouldRefreshMessagesForControlHandoff({
                previousControlledByUser: true,
                nextControlledByUser: false,
            }),
        ).toBe(true);
    });

    it('refreshes for mobile to desktop handoff', () => {
        expect(
            shouldRefreshMessagesForControlHandoff({
                previousControlledByUser: false,
                nextControlledByUser: true,
            }),
        ).toBe(true);
    });

    it('does not refresh when the handoff state is unchanged or unknown', () => {
        expect(
            shouldRefreshMessagesForControlHandoff({
                previousControlledByUser: false,
                nextControlledByUser: false,
            }),
        ).toBe(false);
        expect(
            shouldRefreshMessagesForControlHandoff({
                previousControlledByUser: true,
                nextControlledByUser: true,
            }),
        ).toBe(false);
        expect(
            shouldRefreshMessagesForControlHandoff({
                previousControlledByUser: undefined,
                nextControlledByUser: false,
            }),
        ).toBe(false);
    });
});
