import { describe, expect, it, vi } from 'vitest';
import { runSessionMessageFetch, type SessionMessageFetchOptions } from './sessionMessageFetchLifecycle';

describe('session message fetch lifecycle', () => {
    it('binds message fetch paging to the account generation and request credentials', async () => {
        const runRequest = vi.fn(async <T>(_generation: number, operation: (request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<T>) => operation({
            signal: new AbortController().signal,
            assertCurrent: vi.fn(),
        }));
        const fetchPage = vi.fn(async () => ({ messages: [], hasMore: false }));
        const runPages = vi.fn(async (params: { fetchPage: (path: string, request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<unknown> }) => {
            await params.fetchPage('/messages', { signal: new AbortController().signal, assertCurrent: vi.fn() });
            return 0;
        });

        await runSessionMessageFetch({
            generation: 9,
            sessionId: 'session-1',
            credentials: { token: 'token' } as never,
            runRequest: runRequest as unknown as SessionMessageFetchOptions['runRequest'],
            runInLock: async (operation) => operation(),
            getSessionEncryption: () => ({ ready: true }),
            getLastSeq: () => 3,
            hasLocalMessages: () => true,
            fetchPage,
            processPage: vi.fn(async () => ({ normalizedMessages: [], minSeq: null, maxSeq: null, lifecycleThinkingState: null })),
            currentFirstSeq: () => 1,
            currentLastSeq: () => 3,
            applyMessages: vi.fn(),
            setFirstSeq: vi.fn(),
            setLastSeq: vi.fn(),
            setHasMoreBefore: vi.fn(),
            recordSuccess: vi.fn(),
            applyHistoryState: vi.fn(),
            applyLifecycleThinkingState: vi.fn(),
            markLoaded: vi.fn(),
            classifyError: () => null,
            isCurrent: () => true,
            applyLoadError: vi.fn(),
            onMissingEncryption: vi.fn(),
            onCompleted: vi.fn(),
            logStalled: vi.fn(),
            runPages,
        });

        expect(runRequest).toHaveBeenCalledWith(9, expect.any(Function));
        expect(fetchPage).toHaveBeenCalledWith('/messages', expect.anything(), expect.objectContaining({ token: 'token' }));
    });

    it('projects only classified current failures and rethrows them', async () => {
        const error = new Error('offline');
        const applyLoadError = vi.fn();

        await expect(runSessionMessageFetch({
            generation: 2,
            sessionId: 'session-2',
            credentials: { token: 'token' } as never,
            runRequest: async (_generation, operation) => operation({ signal: new AbortController().signal, assertCurrent: vi.fn() }),
            runInLock: async (operation) => operation(),
            getSessionEncryption: () => ({ ready: true }),
            getLastSeq: () => 0,
            hasLocalMessages: () => false,
            fetchPage: async () => ({ messages: [], hasMore: false }),
            processPage: async () => { throw error; },
            currentFirstSeq: () => undefined,
            currentLastSeq: () => undefined,
            applyMessages: vi.fn(),
            setFirstSeq: vi.fn(),
            setLastSeq: vi.fn(),
            setHasMoreBefore: vi.fn(),
            recordSuccess: vi.fn(),
            applyHistoryState: vi.fn(),
            applyLifecycleThinkingState: vi.fn(),
            markLoaded: vi.fn(),
            classifyError: () => 'network',
            isCurrent: () => true,
            applyLoadError,
            onMissingEncryption: vi.fn(),
            onCompleted: vi.fn(),
            logStalled: vi.fn(),
        })).rejects.toBe(error);

        expect(applyLoadError).toHaveBeenCalledWith('network');
    });
});
