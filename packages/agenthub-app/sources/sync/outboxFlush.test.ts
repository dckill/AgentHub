import { describe, expect, it, vi } from 'vitest';

import { flushOutboxBatch, type OutboxMessage, type OutboxFlushResponse } from './outboxFlush';

const message = (localId: string): OutboxMessage => ({ localId, content: `content-${localId}` });

describe('flushOutboxBatch', () => {
    it('reads the latest last sequence after an in-flight send completes', async () => {
        let currentLastSeq = 5;
        const setLastSeq = vi.fn();

        await flushOutboxBatch({
            pending: [message('first')],
            batch: [message('first')],
            controller: new AbortController(),
            runRequest: (operation) => operation(new AbortController().signal),
            postMessages: vi.fn(async () => {
                currentLastSeq = 20;
                return { messages: [{ seq: 12 }] } satisfies OutboxFlushResponse;
            }),
            assertCurrent: vi.fn(),
            currentLastSeq: () => currentLastSeq,
            setLastSeq,
        });

        expect(setLastSeq).toHaveBeenCalledWith(20);
    });

    it('posts the snapshot, removes only sent messages, and advances the last sequence', async () => {
        const pending = [message('first'), message('second')];
        const batch = pending.slice();
        const controller = new AbortController();
        const setLastSeq = vi.fn();
        const postMessages = vi.fn().mockResolvedValue({ messages: [{ seq: 8 }, { seq: 12 }] } satisfies OutboxFlushResponse);

        await flushOutboxBatch({
            pending,
            batch,
            controller,
            runRequest: (operation) => operation(new AbortController().signal),
            postMessages,
            assertCurrent: vi.fn(),
            currentLastSeq: () => 5,
            setLastSeq,
        });

        expect(postMessages).toHaveBeenCalledWith(batch, controller.signal);
        expect(pending).toEqual([]);
        expect(setLastSeq).toHaveBeenCalledWith(12);
    });

    it('keeps messages appended during the request for a later batch', async () => {
        const pending = [message('first')];
        const batch = pending.slice();
        const postMessages = vi.fn(async () => {
            pending.push(message('later'));
            return { messages: [] } satisfies OutboxFlushResponse;
        });

        await flushOutboxBatch({
            pending,
            batch,
            controller: new AbortController(),
            runRequest: (operation) => operation(new AbortController().signal),
            postMessages,
            assertCurrent: vi.fn(),
            currentLastSeq: () => 10,
            setLastSeq: vi.fn(),
        });

        expect(pending).toEqual([message('later')]);
    });

    it('propagates request failures without acknowledging pending messages', async () => {
        const pending = [message('first')];
        const error = new Error('offline');

        await expect(flushOutboxBatch({
            pending,
            batch: pending.slice(),
            controller: new AbortController(),
            runRequest: (operation) => operation(new AbortController().signal),
            postMessages: vi.fn().mockRejectedValue(error),
            assertCurrent: vi.fn(),
            currentLastSeq: () => 0,
            setLastSeq: vi.fn(),
        })).rejects.toBe(error);

        expect(pending).toEqual([message('first')]);
    });

    it('aborts the send controller when the account request is aborted', async () => {
        const requestController = new AbortController();
        const sendController = new AbortController();
        const postMessages = vi.fn(async (_batch: OutboxMessage[], signal: AbortSignal) => {
            requestController.abort();
            expect(signal.aborted).toBe(true);
            return { messages: [] } satisfies OutboxFlushResponse;
        });

        await flushOutboxBatch({
            pending: [message('first')],
            batch: [message('first')],
            controller: sendController,
            runRequest: (operation) => operation(requestController.signal),
            postMessages,
            assertCurrent: vi.fn(),
            currentLastSeq: () => 0,
            setLastSeq: vi.fn(),
        });
        expect(sendController.signal.aborted).toBe(true);
    });
});
