import type { ApiMessage } from './apiTypes';
import type { ProcessedMessagePage } from './messagePageApplication';
import {
    applyOlderMessagesPage,
    type OlderMessagesPageResult,
} from './olderMessagesPageApplication';
import type { NormalizedMessage } from './typesRaw';

export type OlderMessagePageRunnerParams = {
    currentFirstSeq: number | undefined;
    currentLastSeq: number | undefined;
    fetchPage: () => Promise<{ messages: ApiMessage[]; hasMore: boolean }>;
    processPage: (messages: ApiMessage[]) => Promise<ProcessedMessagePage>;
    assertCurrent: () => void;
    applyMessages: (messages: NormalizedMessage[]) => void;
    applyPageState: (state: OlderMessagesPageResult) => void;
    recordSuccess: () => void;
    applyHistoryState: (state: { hasMoreBefore: boolean; isLoadingBefore: false }) => void;
};

/** Fetch, decrypt and apply one older-message page. */
export async function runOlderMessagePage(
    params: OlderMessagePageRunnerParams,
): Promise<number> {
    const data = await params.fetchPage();
    const messages = Array.isArray(data.messages) ? data.messages : [];
    const processed = await params.processPage(messages);
    params.assertCurrent();
    if (processed.normalizedMessages.length > 0) {
        params.applyMessages(processed.normalizedMessages);
    }

    const pageState = applyOlderMessagesPage({
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
    return processed.normalizedMessages.length;
}
