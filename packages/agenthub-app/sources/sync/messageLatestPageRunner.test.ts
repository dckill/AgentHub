import { describe, expect, it, vi } from 'vitest';
import { runLatestMessagePage } from './messageLatestPageRunner';

describe('runLatestMessagePage', () => {
    it('applies decrypted messages, page state, retry success, lifecycle and loaded state', async () => {
        const applyMessages = vi.fn();
        const applyPageState = vi.fn();
        const recordSuccess = vi.fn();
        const applyHistoryState = vi.fn();
        const applyLifecycleThinkingState = vi.fn();
        const markLoaded = vi.fn();
        const processed = {
            normalizedMessages: [{ id: 'message-1' } as never],
            minSeq: 4,
            maxSeq: 5,
            lifecycleThinkingState: true,
        };

        const count = await runLatestMessagePage({
            currentFirstSeq: 2,
            currentLastSeq: 3,
            fetchPage: async () => ({ messages: [] as never[], hasMore: true }),
            processPage: async () => processed,
            assertCurrent: vi.fn(),
            applyMessages,
            applyPageState,
            recordSuccess,
            applyHistoryState,
            applyLifecycleThinkingState,
            markLoaded,
        });

        expect(count).toBe(1);
        expect(applyMessages).toHaveBeenCalledWith(processed.normalizedMessages);
        expect(applyPageState).toHaveBeenCalledWith(expect.objectContaining({
            firstSeq: 4,
            lastSeq: 5,
            hasMoreBefore: true,
        }));
        expect(recordSuccess).toHaveBeenCalledOnce();
        expect(applyHistoryState).toHaveBeenCalledWith({ hasMoreBefore: true, isLoadingBefore: false });
        expect(applyLifecycleThinkingState).toHaveBeenCalledWith(true);
        expect(markLoaded).toHaveBeenCalledOnce();
    });

    it('does not write an empty normalized page but still marks the page loaded', async () => {
        const applyMessages = vi.fn();
        const markLoaded = vi.fn();

        const count = await runLatestMessagePage({
            currentFirstSeq: 10,
            currentLastSeq: 20,
            fetchPage: async () => ({ messages: [] as never[], hasMore: false }),
            processPage: async () => ({
                normalizedMessages: [],
                minSeq: null,
                maxSeq: null,
                lifecycleThinkingState: null,
            }),
            assertCurrent: vi.fn(),
            applyMessages,
            applyPageState: vi.fn(),
            recordSuccess: vi.fn(),
            applyHistoryState: vi.fn(),
            applyLifecycleThinkingState: vi.fn(),
            markLoaded,
        });

        expect(count).toBe(0);
        expect(applyMessages).not.toHaveBeenCalled();
        expect(markLoaded).toHaveBeenCalledOnce();
    });
});
