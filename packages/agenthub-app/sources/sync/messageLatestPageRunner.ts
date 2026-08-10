import type { ApiMessage } from './apiTypes';
import type { ProcessedMessagePage } from './messagePageApplication';
import {
    applyLatestMessagesPage,
    type LatestMessagesPageResult,
} from './messagePaginationApplication';
import type { NormalizedMessage } from './typesRaw';

export type LatestMessagePageRunnerParams = {
    currentFirstSeq: number | undefined;
    currentLastSeq: number | undefined;
    fetchPage: () => Promise<{ messages: ApiMessage[]; hasMore: boolean }>;
    processPage: (messages: ApiMessage[]) => Promise<ProcessedMessagePage>;
    assertCurrent: () => void;
    applyMessages: (messages: NormalizedMessage[]) => void;
    applyPageState: (state: LatestMessagesPageResult) => void;
    recordSuccess: () => void;
    applyHistoryState: (state: { hasMoreBefore: boolean; isLoadingBefore: false }) => void;
    applyLifecycleThinkingState: (state: boolean | null) => void;
    markLoaded: () => void;
};

/** Fetch, decrypt and apply one initial latest-message page. */
export async function runLatestMessagePage(
    params: LatestMessagePageRunnerParams,
): Promise<number> {
    const data = await params.fetchPage();
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const processed = await params.processPage(messages);
    params.assertCurrent();
    if (processed.normalizedMessages.length > 0) {
        params.applyMessages(processed.normalizedMessages);
    }

    const pageState = applyLatestMessagesPage({
        currentFirstSeq: params.currentFirstSeq,
        currentLastSeq: params.currentLastSeq,
        processedMinSeq: processed.minSeq,
        processedMaxSeq: processed.maxSeq,
        hasMore: !!data.hasMore,
    });
    params.applyPageState(pageState);
    params.recordSuccess();
    params.applyHistoryState({
        hasMoreBefore: pageState.hasMoreBefore,
        isLoadingBefore: pageState.isLoadingBefore,
    });
    params.applyLifecycleThinkingState(processed.lifecycleThinkingState);
    params.markLoaded();
    return processed.normalizedMessages.length;
}
