import { describe, expect, it, vi } from 'vitest';
import { runOutboxSendLifecycle, type OutboxMessage } from './outboxSendLifecycle';

const message = (localId: string): OutboxMessage => ({ localId, content: localId });

describe('runOutboxSendLifecycle', () => {
    it('clears idle background state without starting a send', async () => {
        const onIdle = vi.fn(async () => undefined);
        const startSend = vi.fn(() => new AbortController());

        await runOutboxSendLifecycle({
            pending: [],
            hasPending: () => false,
            startSend,
            finishSend: vi.fn(),
            flushBatch: vi.fn(),
            deletePending: vi.fn(),
            onIdle,
            isCurrent: () => true,
            onCurrentError: vi.fn(),
            isBackground: () => false,
            onBackgroundPending: vi.fn(),
        });

        expect(startSend).not.toHaveBeenCalled();
        expect(onIdle).toHaveBeenCalledOnce();
    });

    it('does not stop the current-account watchdog when an empty stale flush settles', async () => {
        const onIdle = vi.fn(async () => undefined);

        await runOutboxSendLifecycle({
            pending: [],
            hasPending: () => false,
            startSend: () => new AbortController(),
            finishSend: vi.fn(),
            flushBatch: vi.fn(),
            deletePending: vi.fn(),
            onIdle,
            isCurrent: () => false,
            onCurrentError: vi.fn(),
            isBackground: () => false,
            onBackgroundPending: vi.fn(),
        });

        expect(onIdle).not.toHaveBeenCalled();
    });

    it('flushes an immutable batch, deletes an empty queue and finalizes idle state', async () => {
        const pending = [message('first')];
        const controller = new AbortController();
        const finishSend = vi.fn();
        const deletePending = vi.fn();
        const onIdle = vi.fn(async () => undefined);
        const flushBatch = vi.fn(async (queue: OutboxMessage[]) => {
            queue.splice(0, 1);
        });

        await runOutboxSendLifecycle({
            pending,
            hasPending: () => pending.length > 0,
            startSend: () => controller,
            finishSend,
            flushBatch,
            deletePending,
            onIdle,
            isCurrent: () => true,
            onCurrentError: vi.fn(),
            isBackground: () => false,
            onBackgroundPending: vi.fn(),
        });

        expect(flushBatch).toHaveBeenCalledWith(pending, [message('first')], controller);
        expect(deletePending).toHaveBeenCalledOnce();
        expect(finishSend).toHaveBeenCalledWith(controller);
        expect(onIdle).toHaveBeenCalledOnce();
    });

    it('restarts the watchdog after a current-account failure and always finalizes the send', async () => {
        const error = new Error('offline');
        const finishSend = vi.fn();
        const onCurrentError = vi.fn();

        await expect(runOutboxSendLifecycle({
            pending: [message('first')],
            hasPending: () => true,
            startSend: () => new AbortController(),
            finishSend,
            flushBatch: vi.fn(async () => { throw error; }),
            deletePending: vi.fn(),
            onIdle: vi.fn(async () => undefined),
            isCurrent: () => true,
            onCurrentError,
            isBackground: () => false,
            onBackgroundPending: vi.fn(),
        })).rejects.toBe(error);

        expect(onCurrentError).toHaveBeenCalledOnce();
        expect(finishSend).toHaveBeenCalledOnce();
    });

    it('starts the watchdog when pending messages remain in the background', async () => {
        const onBackgroundPending = vi.fn();
        const pending = [message('first')];

        await runOutboxSendLifecycle({
            pending,
            hasPending: () => pending.length > 0,
            startSend: () => new AbortController(),
            finishSend: vi.fn(),
            flushBatch: vi.fn(async (queue: OutboxMessage[], batch: OutboxMessage[]) => {
                queue.splice(0, batch.length);
                queue.push(message('later'));
            }),
            deletePending: vi.fn(),
            onIdle: vi.fn(async () => undefined),
            isCurrent: () => true,
            onCurrentError: vi.fn(),
            isBackground: () => true,
            onBackgroundPending,
        });

        expect(onBackgroundPending).toHaveBeenCalledOnce();
    });

    it('does not delete a replacement queue or stop the watchdog after the account becomes stale', async () => {
        const pending = [message('first')];
        let current = true;
        const deletePending = vi.fn();
        const onIdle = vi.fn(async () => undefined);

        await runOutboxSendLifecycle({
            pending,
            hasPending: () => pending.length > 0,
            startSend: () => new AbortController(),
            finishSend: vi.fn(),
            flushBatch: vi.fn(async (queue: OutboxMessage[], batch: OutboxMessage[]) => {
                queue.splice(0, batch.length);
                current = false;
            }),
            deletePending,
            onIdle,
            isCurrent: () => current,
            onCurrentError: vi.fn(),
            isBackground: () => false,
            onBackgroundPending: vi.fn(),
        });

        expect(deletePending).not.toHaveBeenCalled();
        expect(onIdle).not.toHaveBeenCalled();
    });

    it('does not start a replacement background watchdog after the account becomes stale', async () => {
        const pending = [message('first')];
        let current = true;
        const onBackgroundPending = vi.fn();

        await runOutboxSendLifecycle({
            pending,
            hasPending: () => pending.length > 0,
            startSend: () => new AbortController(),
            finishSend: vi.fn(),
            flushBatch: vi.fn(async (queue: OutboxMessage[], batch: OutboxMessage[]) => {
                queue.splice(0, batch.length);
                queue.push(message('later'));
                current = false;
            }),
            deletePending: vi.fn(),
            onIdle: vi.fn(async () => undefined),
            isCurrent: () => current,
            onCurrentError: vi.fn(),
            isBackground: () => true,
            onBackgroundPending,
        });

        expect(onBackgroundPending).not.toHaveBeenCalled();
    });
});
