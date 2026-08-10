import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdateContainer } from './apiTypes';
import {
    dispatchNewMessageRealtimeUpdate,
    type NewMessageRealtimeDispatchContext,
} from './newMessageRealtimeDispatch';

const context = (): NewMessageRealtimeDispatchContext => ({
    getSession: vi.fn(),
    getSessionEncryption: vi.fn(),
    getCurrentLastSeq: vi.fn(),
    refreshMissingSession: vi.fn(),
    invalidateMessages: vi.fn(),
    applySession: vi.fn(),
    enqueueMessage: vi.fn(),
    setLastSeq: vi.fn(),
    isMutableToolCall: vi.fn(),
    invalidateGitStatus: vi.fn(),
    assertCurrent: vi.fn(),
    onDecryptError: vi.fn(),
    onEmptyDecryption: vi.fn(),
    onUnreadMessage: vi.fn(),
});

const envelope = (body: ApiUpdateContainer['body']): ApiUpdateContainer => ({
    id: 'update-1',
    seq: 7,
    createdAt: 100,
    body,
});

const message = {
    id: 'message-1',
    seq: 4,
    localId: null,
    content: { t: 'encrypted' as const, c: 'ciphertext' },
    createdAt: 10,
    updatedAt: 10,
};

describe('new message realtime dispatch', () => {
    it('routes the message envelope with session and sequence dependencies', async () => {
        const params = context();
        const handler = vi.fn(async () => undefined);

        await expect(dispatchNewMessageRealtimeUpdate(envelope({
            t: 'new-message',
            sid: 'session-1',
            message,
        }), { ...params, handleNewMessage: handler })).resolves.toBe(true);

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ sid: 'session-1' }),
            seq: 7,
            createdAt: 100,
        }));
    });

    it('returns false without side effects for non-message updates', async () => {
        const params = context();

        await expect(dispatchNewMessageRealtimeUpdate(envelope({
            t: 'update-account',
            id: 'account-1',
            settings: null,
        }), params)).resolves.toBe(false);

        expect(params.enqueueMessage).not.toHaveBeenCalled();
        expect(params.refreshMissingSession).not.toHaveBeenCalled();
    });
});
