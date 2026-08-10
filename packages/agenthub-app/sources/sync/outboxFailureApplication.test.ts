import { describe, expect, it, vi } from 'vitest';
import { applyPendingOutboxFailure } from './outboxFailureApplication';

describe('outbox failure application', () => {
    it('projects one failure event for every pending session', () => {
        const enqueueMessages = vi.fn();
        const failAll = vi.fn(() => ['session-a', 'session-b']);

        applyPendingOutboxFailure({
            failAll,
            enqueueMessages,
            now: 123,
            reasonText: 'network unavailable',
            createMessageId: () => 'message-id',
        });

        expect(failAll).toHaveBeenCalledOnce();
        expect(enqueueMessages).toHaveBeenCalledTimes(2);
        expect(enqueueMessages).toHaveBeenNthCalledWith(1, 'session-a', [{
            id: 'message-id',
            localId: null,
            createdAt: 123,
            role: 'event',
            isSidechain: false,
            content: { type: 'message', message: 'network unavailable' },
        }]);
    });

    it('does not enqueue anything when the outbox is already empty', () => {
        const enqueueMessages = vi.fn();
        applyPendingOutboxFailure({
            failAll: () => [],
            enqueueMessages,
            now: 123,
            reasonText: 'network unavailable',
            createMessageId: vi.fn(),
        });
        expect(enqueueMessages).not.toHaveBeenCalled();
    });
});
