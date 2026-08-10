import type { ApiMessage } from './apiTypes';
import type { ProcessedMessagePage } from './messagePageApplication';
import { MessageCatchupBuffer } from './messageCatchupBuffer';
import { applyMessageCatchupPage } from './messageCatchupDecision';
import type { NormalizedMessage } from './typesRaw';

export type MessageCatchupBatch = {
    messages: NormalizedMessage[];
    minSeq: number | null;
    maxSeq: number | null;
};

export type MessageCatchupRunnerParams = {
    initialAfterSeq: number;
    commitThreshold: number;
    fetchPage: (afterSeq: number) => Promise<{ messages: ApiMessage[]; hasMore: boolean }>;
    processPage: (messages: ApiMessage[]) => Promise<ProcessedMessagePage>;
    commitBatch: (batch: MessageCatchupBatch) => void;
    assertCurrent: () => void;
    logStalled: () => void;
};

export type MessageCatchupResult = {
    totalNormalized: number;
    lifecycleThinkingState: boolean | null;
};

/** Run incremental message catch-up while keeping buffering and stall decisions deterministic. */
export async function runMessageCatchup(
    params: MessageCatchupRunnerParams,
): Promise<MessageCatchupResult> {
    let afterSeq = params.initialAfterSeq;
    let hasMore = true;
    let totalNormalized = 0;
    let lifecycleThinkingState: boolean | null = null;

    const catchup = new MessageCatchupBuffer<NormalizedMessage>(
        params.commitThreshold,
        (batch) => params.commitBatch(batch),
    );

    while (hasMore) {
        const data = await params.fetchPage(afterSeq);
        const messages = Array.isArray(data.messages) ? data.messages : [];
        const processed = await params.processPage(messages);
        params.assertCurrent();
        catchup.push(processed.normalizedMessages, {
            minSeq: processed.minSeq,
            maxSeq: processed.maxSeq,
        });

        const decision = applyMessageCatchupPage({
            previousAfterSeq: afterSeq,
            hasMore: !!data.hasMore,
            totalNormalized,
            lifecycleThinkingState,
            processed,
        });
        hasMore = decision.continue;
        totalNormalized = decision.totalNormalized;
        lifecycleThinkingState = decision.lifecycleThinkingState;
        if (decision.stalled) {
            params.logStalled();
        }
        afterSeq = decision.afterSeq;
    }

    params.assertCurrent();
    catchup.flush();

    return { totalNormalized, lifecycleThinkingState };
}
