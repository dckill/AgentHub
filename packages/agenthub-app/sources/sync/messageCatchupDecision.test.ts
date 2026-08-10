import { describe, expect, it } from 'vitest';
import { applyMessageCatchupPage } from './messageCatchupDecision';

describe('applyMessageCatchupPage', () => {
    it('advances the cursor and accumulates lifecycle state for a progressing page', () => {
        const result = applyMessageCatchupPage({
            previousAfterSeq: 4,
            hasMore: true,
            totalNormalized: 2,
            lifecycleThinkingState: null,
            processed: {
                normalizedMessages: [{ id: 'm-5' } as never],
                minSeq: 5,
                maxSeq: 8,
                lifecycleThinkingState: true,
            },
        });

        expect(result).toMatchObject({
            afterSeq: 8,
            continue: true,
            totalNormalized: 3,
            lifecycleThinkingState: true,
            stalled: false,
        });
    });

    it('stops on a stalled page while preserving the previous lifecycle state', () => {
        const result = applyMessageCatchupPage({
            previousAfterSeq: 8,
            hasMore: true,
            totalNormalized: 3,
            lifecycleThinkingState: false,
            processed: {
                normalizedMessages: [],
                minSeq: null,
                maxSeq: null,
                lifecycleThinkingState: null,
            },
        });

        expect(result).toMatchObject({
            afterSeq: 8,
            continue: false,
            totalNormalized: 3,
            lifecycleThinkingState: false,
            stalled: true,
        });
    });
});
