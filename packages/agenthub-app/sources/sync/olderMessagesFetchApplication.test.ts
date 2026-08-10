import { describe, expect, it, vi } from 'vitest';
import { runOlderMessagesFetchApplication } from './olderMessagesFetchApplication';

describe('runOlderMessagesFetchApplication', () => {
    it('reads pagination cursors after acquiring the session lock', async () => {
        let currentLastSeq = 12;
        const applyPageState = vi.fn();

        await runOlderMessagesFetchApplication({
            sessionId: 'session-concurrent',
            beforeSeq: 12,
            runRequest: async (operation) => operation({ signal: new AbortController().signal, assertCurrent: vi.fn() }),
            runInLock: async (operation) => {
                currentLastSeq = 20;
                return operation();
            },
            fetchPage: async () => ({ messages: [], hasMore: true }),
            processPage: async () => ({
                normalizedMessages: [],
                minSeq: null,
                maxSeq: 10,
                lifecycleThinkingState: null,
            }),
            currentFirstSeq: () => 1,
            currentLastSeq: () => currentLastSeq,
            applyMessages: vi.fn(),
            applyPageState,
            recordSuccess: vi.fn(),
            applyHistoryState: vi.fn(),
            applyLoading: vi.fn(),
            resetLoading: vi.fn(),
            applyFailure: vi.fn(),
            isCurrent: () => true,
        });

        expect(applyPageState).toHaveBeenCalledWith(expect.objectContaining({ lastSeq: 20 }));
    });

    it('owns the older-page loading lifecycle and request path', async () => {
        const request = { signal: new AbortController().signal, assertCurrent: vi.fn() };
        const applyMessages = vi.fn();
        const applyPageState = vi.fn();
        const applyHistoryState = vi.fn();
        const recordSuccess = vi.fn();

        await expect(runOlderMessagesFetchApplication({
            sessionId: 'session-1',
            beforeSeq: 12,
            runRequest: async (operation) => operation(request),
            runInLock: async (operation) => operation(),
            fetchPage: async (path, signal) => {
                expect(path).toBe('/v3/sessions/session-1/messages?direction=backward&before_seq=12&limit=100');
                expect(signal).toBe(request.signal);
                return { messages: [], hasMore: false };
            },
            processPage: async () => ({
                normalizedMessages: [],
                minSeq: null,
                maxSeq: null,
                lifecycleThinkingState: null,
            }),
            currentFirstSeq: () => 12,
            currentLastSeq: () => 20,
            applyMessages,
            applyPageState,
            recordSuccess,
            applyHistoryState,
            applyLoading: vi.fn(),
            resetLoading: vi.fn(),
            applyFailure: vi.fn(),
            isCurrent: () => true,
        })).resolves.toBe(0);

        expect(applyMessages).not.toHaveBeenCalled();
        expect(applyPageState).toHaveBeenCalledWith(expect.objectContaining({ hasMoreBefore: false }));
        expect(recordSuccess).toHaveBeenCalledOnce();
        expect(applyHistoryState).toHaveBeenCalledWith({ hasMoreBefore: false, isLoadingBefore: false });
    });

    it('resets loading and records failure when page fetch fails', async () => {
        const applyFailure = vi.fn();
        const request = { signal: new AbortController().signal, assertCurrent: vi.fn() };

        await expect(runOlderMessagesFetchApplication({
            sessionId: 'session-1',
            beforeSeq: 12,
            runRequest: async (operation) => operation(request),
            runInLock: async (operation) => operation(),
            fetchPage: async () => { throw new Error('network'); },
            processPage: async () => ({ normalizedMessages: [], minSeq: null, maxSeq: null, lifecycleThinkingState: null }),
            currentFirstSeq: () => 12,
            currentLastSeq: () => 20,
            applyMessages: vi.fn(),
            applyPageState: vi.fn(),
            recordSuccess: vi.fn(),
            applyHistoryState: vi.fn(),
            applyLoading: vi.fn(),
            resetLoading: vi.fn(),
            applyFailure,
            isCurrent: () => true,
        })).rejects.toThrow('network');

        expect(applyFailure).toHaveBeenCalledOnce();
    });
});
