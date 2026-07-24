import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, allocateSessionSeqBatch, allocateUserSeqBatch, tx } = vi.hoisted(() => {
    const tx = {
        sessionMessage: {
            findMany: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
        },
        accountSyncEvent: {
            create: vi.fn(),
        },
    };
    return {
        tx,
        db: {
            session: { findFirst: vi.fn() },
            $transaction: vi.fn((callback: any) => callback(tx)),
        },
        allocateSessionSeqBatch: vi.fn(),
        allocateUserSeqBatch: vi.fn(),
    };
});

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/storage/seq', () => ({ allocateSessionSeqBatch, allocateUserSeqBatch }));

import { appendEncryptedSessionMessages } from './messageAppend';

const createdAt = new Date('2026-05-07T00:00:00.000Z');

describe('appendEncryptedSessionMessages', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.session.findFirst.mockResolvedValue({ id: 'session-1' });
        tx.sessionMessage.findMany.mockResolvedValue([]);
        tx.sessionMessage.count.mockResolvedValue(0);
        allocateSessionSeqBatch.mockResolvedValue([10, 11]);
        allocateUserSeqBatch.mockResolvedValue([100, 101]);
        tx.sessionMessage.create
            .mockResolvedValueOnce({ id: 'msg-1', seq: 10, content: { t: 'encrypted', c: 'one' }, localId: 'local-1', createdAt, updatedAt: createdAt })
            .mockResolvedValueOnce({ id: 'msg-2', seq: 11, content: { t: 'encrypted', c: 'two' }, localId: null, createdAt, updatedAt: createdAt });
        tx.accountSyncEvent.create.mockResolvedValue({});
    });

    it('dedupes local ids and writes message-created sync events for new messages', async () => {
        const result = await appendEncryptedSessionMessages('user-1', 'session-1', [
            { content: 'one', localId: 'local-1' },
            { content: 'duplicate', localId: 'local-1' },
            { content: 'two' },
        ]);

        expect(result.createdMessages).toEqual([
            expect.objectContaining({ id: 'msg-1', seq: 10, localId: 'local-1', updateSeq: 100 }),
            expect.objectContaining({ id: 'msg-2', seq: 11, localId: null, updateSeq: 101 }),
        ]);
        expect(allocateSessionSeqBatch).toHaveBeenCalledWith('session-1', 2, tx);
        expect(allocateUserSeqBatch).toHaveBeenCalledWith('user-1', 2, tx);
        expect(tx.accountSyncEvent.create.mock.calls.map(([args]) => args)).toEqual([
            { data: { accountId: 'user-1', seq: 100, type: 'message-created', payload: { sessionId: 'session-1', messageId: 'msg-1', sessionSeq: 10 } } },
            { data: { accountId: 'user-1', seq: 101, type: 'message-created', payload: { sessionId: 'session-1', messageId: 'msg-2', sessionSeq: 11 } } },
        ]);
    });

    it('returns existing messages for repeated local ids without allocating new seqs', async () => {
        tx.sessionMessage.findMany.mockResolvedValueOnce([
            { id: 'existing', seq: 7, content: { t: 'encrypted', c: 'old' }, localId: 'local-1', createdAt, updatedAt: createdAt },
        ]);
        allocateSessionSeqBatch.mockResolvedValueOnce([]);
        allocateUserSeqBatch.mockResolvedValueOnce([]);

        const result = await appendEncryptedSessionMessages('user-1', 'session-1', [{ content: 'one', localId: 'local-1' }]);

        expect(result).toEqual({
            responseMessages: [expect.objectContaining({ id: 'existing', seq: 7, localId: 'local-1' })],
            createdMessages: [],
        });
        expect(tx.sessionMessage.create).not.toHaveBeenCalled();
        expect(tx.accountSyncEvent.create).not.toHaveBeenCalled();
    });

    it('throws when the session is not owned by the user', async () => {
        db.session.findFirst.mockResolvedValueOnce(null);

        await expect(appendEncryptedSessionMessages('user-1', 'missing', [{ content: 'one' }])).rejects.toThrow('Session not found');
        expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('rejects before sequence allocation when new messages exceed the account quota', async () => {
        tx.sessionMessage.count.mockResolvedValue(1_000_000);

        await expect(appendEncryptedSessionMessages('user-1', 'session-1', [{ content: 'one', localId: 'new' }]))
            .rejects.toMatchObject({ name: 'AccountQuotaError', resource: 'messages', limit: 1_000_000 });
        expect(allocateSessionSeqBatch).not.toHaveBeenCalled();
        expect(tx.sessionMessage.create).not.toHaveBeenCalled();
    });
});
