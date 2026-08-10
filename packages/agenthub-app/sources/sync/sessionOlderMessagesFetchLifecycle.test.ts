import { describe, expect, it, vi } from 'vitest';
import { runSessionOlderMessagesFetch, type SessionOlderMessagesFetchOptions } from './sessionOlderMessagesFetchLifecycle';

describe('session older messages fetch lifecycle', () => {
    it('binds backward paging to the account generation and credentials', async () => {
        const runRequest = vi.fn(async <T>(_generation: number, operation: (request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<T>) => operation({
            signal: new AbortController().signal,
            assertCurrent: vi.fn(),
        }));
        const fetchPage = vi.fn(async () => ({ messages: [], hasMore: false }));

        await runSessionOlderMessagesFetch({
            generation: 4,
            sessionId: 'session-older',
            beforeSeq: 12,
            credentials: { token: 'token' } as never,
            runRequest: runRequest as unknown as SessionOlderMessagesFetchOptions['runRequest'],
            runInLock: async (operation) => operation(),
            fetchPage,
            processPage: vi.fn(async () => ({ normalizedMessages: [], minSeq: null, maxSeq: null, lifecycleThinkingState: null })),
            currentFirstSeq: () => 1,
            currentLastSeq: () => 12,
            applyMessages: vi.fn(),
            applyPageState: vi.fn(),
            recordSuccess: vi.fn(),
            applyHistoryState: vi.fn(),
            applyLoading: vi.fn(),
            resetLoading: vi.fn(),
            applyFailure: vi.fn(),
            isCurrent: () => true,
        });

        expect(runRequest).toHaveBeenCalledWith(4, expect.any(Function));
        expect(fetchPage).toHaveBeenCalledWith(
            '/v3/sessions/session-older/messages?direction=backward&before_seq=12&limit=100',
            expect.anything(),
            expect.objectContaining({ token: 'token' }),
        );
    });

    it('preserves loading recovery and rethrows page failures', async () => {
        const error = new Error('offline');
        const applyFailure = vi.fn();
        const resetLoading = vi.fn();

        await expect(runSessionOlderMessagesFetch({
            generation: 5,
            sessionId: 'session-error',
            beforeSeq: 8,
            credentials: { token: 'token' } as never,
            runRequest: async (_generation, operation) => operation({ signal: new AbortController().signal, assertCurrent: vi.fn() }),
            runInLock: async (operation) => operation(),
            fetchPage: async () => { throw error; },
            processPage: vi.fn(),
            currentFirstSeq: () => 1,
            currentLastSeq: () => 8,
            applyMessages: vi.fn(),
            applyPageState: vi.fn(),
            recordSuccess: vi.fn(),
            applyHistoryState: vi.fn(),
            applyLoading: vi.fn(),
            resetLoading,
            applyFailure,
            isCurrent: () => true,
        })).rejects.toBe(error);

        expect(applyFailure).toHaveBeenCalledOnce();
        expect(resetLoading).toHaveBeenCalledOnce();
    });
});
