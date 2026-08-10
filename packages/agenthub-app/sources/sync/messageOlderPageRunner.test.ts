import { describe, expect, it, vi } from 'vitest';
import { runOlderMessagePage } from './messageOlderPageRunner';

describe('runOlderMessagePage', () => {
    it('applies older messages, cursor state, retry success and history state', async () => {
        const applyMessages = vi.fn();
        const applyPageState = vi.fn();
        const recordSuccess = vi.fn();
        const applyHistoryState = vi.fn();
        const processed = {
            normalizedMessages: [{ id: 'message-1' } as never],
            minSeq: 4,
            maxSeq: 5,
            lifecycleThinkingState: null,
        };

        const count = await runOlderMessagePage({
            currentFirstSeq: 10,
            currentLastSeq: 20,
            fetchPage: async () => ({ messages: [] as never[], hasMore: true }),
            processPage: async () => processed,
            assertCurrent: vi.fn(),
            applyMessages,
            applyPageState,
            recordSuccess,
            applyHistoryState,
        });

        expect(count).toBe(1);
        expect(applyMessages).toHaveBeenCalledWith(processed.normalizedMessages);
        expect(applyPageState).toHaveBeenCalledWith(expect.objectContaining({
            firstSeq: 4,
            lastSeq: 20,
            hasMoreBefore: true,
        }));
        expect(recordSuccess).toHaveBeenCalledOnce();
        expect(applyHistoryState).toHaveBeenCalledWith({ hasMoreBefore: true, isLoadingBefore: false });
    });

    it('skips empty normalized messages while still closing the history loading state', async () => {
        const applyMessages = vi.fn();
        const applyHistoryState = vi.fn();

        const count = await runOlderMessagePage({
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
            applyHistoryState,
        });

        expect(count).toBe(0);
        expect(applyMessages).not.toHaveBeenCalled();
        expect(applyHistoryState).toHaveBeenCalledWith({ hasMoreBefore: false, isLoadingBefore: false });
    });
});
