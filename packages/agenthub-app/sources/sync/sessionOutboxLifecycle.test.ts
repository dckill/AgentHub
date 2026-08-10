import { describe, expect, it, vi } from 'vitest';
import { runSessionOutboxLifecycle } from './sessionOutboxLifecycle';
import type { SessionOutboxLifecycleOptions } from './sessionOutboxLifecycle';

describe('session outbox lifecycle', () => {
    it('binds batch flushes to the account generation and projects the highest seq', async () => {
        const pending = [{ localId: 'm1', content: 'message' }];
        const runRequestMock = vi.fn(async <T>(_generation: number, operation: (request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<T>): Promise<T> => operation({
            signal: new AbortController().signal,
            assertCurrent: vi.fn(),
        }));
        const runRequest = runRequestMock as unknown as SessionOutboxLifecycleOptions['runRequest'];
        const setLastSeq = vi.fn();
        const deletePending = vi.fn();

        await runSessionOutboxLifecycle({
            generation: 8,
            pending,
            hasPending: () => pending.length > 0,
            startSend: () => new AbortController(),
            finishSend: vi.fn(),
            runRequest,
            postMessages: vi.fn(async () => ({ messages: [{ seq: 9 }, { seq: 7 }] })),
            assertCurrent: vi.fn(),
            currentLastSeq: () => 4,
            setLastSeq,
            deletePending,
            onIdle: vi.fn(async () => undefined),
            isCurrent: () => true,
            onCurrentError: vi.fn(),
            isBackground: () => false,
            onBackgroundPending: vi.fn(),
        });

        expect(runRequestMock).toHaveBeenCalledWith(8, expect.any(Function));
        expect(setLastSeq).toHaveBeenCalledWith(9);
        expect(deletePending).toHaveBeenCalledOnce();
    });

    it('reports current-account failures and always finalizes the active send', async () => {
        const error = new Error('offline');
        const onCurrentError = vi.fn();
        const finishSend = vi.fn();

        await expect(runSessionOutboxLifecycle({
            generation: 2,
            pending: [{ localId: 'm1', content: 'message' }],
            hasPending: () => true,
            startSend: () => new AbortController(),
            finishSend,
            runRequest: async (_generation, operation) => operation({
                signal: new AbortController().signal,
                assertCurrent: vi.fn(),
            }),
            postMessages: vi.fn(async () => { throw error; }),
            assertCurrent: vi.fn(),
            currentLastSeq: () => 0,
            setLastSeq: vi.fn(),
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
});
