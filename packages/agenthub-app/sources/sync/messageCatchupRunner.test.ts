import { describe, expect, it, vi } from 'vitest';
import { runMessageCatchup } from './messageCatchupRunner';

const page = (maxSeq: number | null, hasMore: boolean, id?: string) => ({
    data: { messages: id ? [{ id }] : [], hasMore },
    processed: {
        normalizedMessages: id ? [{ id, role: 'user', content: id } as never] : [],
        minSeq: maxSeq,
        maxSeq,
        lifecycleThinkingState: null,
    },
});

describe('runMessageCatchup', () => {
    it('advances afterSeq across pages and flushes the bounded buffer once', async () => {
        const fetchAfterSeq: number[] = [];
        const commits: unknown[] = [];
        const pages = [page(1, true, 'm1'), page(2, false, 'm2')];
        let pageIndex = 0;

        const result = await runMessageCatchup({
            initialAfterSeq: 0,
            commitThreshold: 2,
            fetchPage: async (afterSeq) => {
                fetchAfterSeq.push(afterSeq);
                return pages[fetchAfterSeq.length - 1].data as never;
            },
            processPage: async () => pages[pageIndex++].processed,
            commitBatch: (batch) => commits.push(batch),
            assertCurrent: vi.fn(),
            logStalled: vi.fn(),
        });

        expect(fetchAfterSeq).toEqual([0, 1]);
        expect(commits).toHaveLength(1);
        expect(result).toEqual({ totalNormalized: 2, lifecycleThinkingState: null });
    });

    it('stops on a stalled page, logs the stall, and does not fetch again', async () => {
        const fetchPage = vi.fn(async () => ({ messages: [], hasMore: true }));
        const logStalled = vi.fn();

        const result = await runMessageCatchup({
            initialAfterSeq: 9,
            commitThreshold: 10,
            fetchPage,
            processPage: async () => ({
                normalizedMessages: [],
                minSeq: null,
                maxSeq: null,
                lifecycleThinkingState: true,
            }),
            commitBatch: vi.fn(),
            assertCurrent: vi.fn(),
            logStalled,
        });

        expect(fetchPage).toHaveBeenCalledOnce();
        expect(logStalled).toHaveBeenCalledOnce();
        expect(result).toEqual({ totalNormalized: 0, lifecycleThinkingState: true });
    });
});
