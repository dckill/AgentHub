import { describe, expect, it, vi } from 'vitest';
import { runSendMessageLifecycle } from './sendMessageLifecycle';

describe('runSendMessageLifecycle', () => {
    it('fails closed when the account changes after preparation', async () => {
        let current = true;
        const dispatch = vi.fn(async () => ({ sent: true, failedAttachments: 0 }));

        await expect(runSendMessageLifecycle({
            isCurrent: () => current,
            prepare: async () => {
                current = false;
                return { kind: 'ready' as const, value: { sessionId: 'session-1' } };
            },
            dispatch,
        })).resolves.toEqual({ sent: false, failedAttachments: 0 });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('preserves preparation failures without dispatching', async () => {
        const dispatch = vi.fn();

        await expect(runSendMessageLifecycle({
            isCurrent: () => true,
            prepare: async () => ({
                kind: 'failed' as const,
                result: { sent: false, failedAttachments: 2, controlDenied: true },
            }),
            dispatch,
        })).resolves.toEqual({ sent: false, failedAttachments: 2, controlDenied: true });
        expect(dispatch).not.toHaveBeenCalled();
    });

    it('preserves attachment failures when the account changes after dispatch', async () => {
        let current = true;

        await expect(runSendMessageLifecycle({
            isCurrent: () => current,
            prepare: async () => ({ kind: 'ready' as const, value: { sessionId: 'session-1' } }),
            dispatch: async () => {
                current = false;
                return { sent: true, failedAttachments: 1 };
            },
        })).resolves.toEqual({ sent: false, failedAttachments: 1 });
    });
});
