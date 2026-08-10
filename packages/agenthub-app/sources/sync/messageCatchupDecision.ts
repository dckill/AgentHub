import type { ProcessedMessagePage } from './messagePageApplication';
import { getMessageFetchProgress } from './messageFetchProgress';

export type MessageCatchupDecision = {
    afterSeq: number;
    continue: boolean;
    totalNormalized: number;
    lifecycleThinkingState: boolean | null;
    stalled: boolean;
};

/**
 * Apply the non-I/O state transition for one incremental message page.
 * Storage writes and catch-up buffering remain owned by Sync.
 */
export function applyMessageCatchupPage(input: {
    previousAfterSeq: number;
    hasMore: boolean;
    totalNormalized: number;
    lifecycleThinkingState: boolean | null;
    processed: ProcessedMessagePage;
}): MessageCatchupDecision {
    const nextSeq = input.processed.maxSeq ?? input.previousAfterSeq;
    const progress = getMessageFetchProgress({
        hasMore: input.hasMore,
        previousSeq: input.previousAfterSeq,
        nextSeq,
    });

    return {
        afterSeq: progress.afterSeq,
        continue: progress.continue,
        totalNormalized: input.totalNormalized + input.processed.normalizedMessages.length,
        lifecycleThinkingState: input.processed.lifecycleThinkingState ?? input.lifecycleThinkingState,
        stalled: input.hasMore && !progress.continue,
    };
}
