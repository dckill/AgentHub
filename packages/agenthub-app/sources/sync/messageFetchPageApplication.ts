import type { ApiMessage } from './apiTypes';
import { applyCatchupMessagesChunk } from './messagePaginationApplication';
import { runMessageCatchup } from './messageCatchupRunner';
import { runLatestMessagePage } from './messageLatestPageRunner';
import type { ProcessedMessagePage } from './messagePageApplication';
import type { NormalizedMessage } from './typesRaw';

type MessageFetchRequest = {
    signal: AbortSignal;
    assertCurrent: () => void;
};

type MessagePageResponse = {
    messages: ApiMessage[];
    hasMore: boolean;
};

const MESSAGE_CATCHUP_COMMIT_SIZE = 1_000;

export type MessageFetchPagesParams<Request extends MessageFetchRequest = MessageFetchRequest> = {
    mode: 'latest' | 'catchup';
    sessionId: string;
    initialAfterSeq: number;
    request: Request;
    fetchPage: (path: string, request: Request) => Promise<MessagePageResponse>;
    processPage: (messages: ApiMessage[], request: Request) => Promise<ProcessedMessagePage>;
    currentFirstSeq: () => number | undefined;
    currentLastSeq: () => number | undefined;
    applyMessages: (messages: NormalizedMessage[]) => void;
    setFirstSeq: (seq: number) => void;
    setLastSeq: (seq: number) => void;
    setHasMoreBefore: (hasMoreBefore: boolean) => void;
    recordSuccess: () => void;
    applyHistoryState: (state: { hasMoreBefore: boolean; isLoadingBefore: false }) => void;
    applyLifecycleThinkingState: (state: boolean | null) => void;
    markLoaded: () => void;
    logStalled: () => void;
};

/** Run the initial latest/catch-up page lifecycle without owning Sync state or network clients. */
export async function runMessageFetchPages<Request extends MessageFetchRequest>(
    params: MessageFetchPagesParams<Request>,
): Promise<number> {
    if (params.mode === 'latest') {
        return runLatestMessagePage({
            currentFirstSeq: params.currentFirstSeq(),
            currentLastSeq: params.currentLastSeq(),
            fetchPage: () => params.fetchPage(
                `/v3/sessions/${params.sessionId}/messages?direction=backward&limit=100`,
                params.request,
            ),
            processPage: (messages) => params.processPage(messages, params.request),
            assertCurrent: params.request.assertCurrent,
            applyMessages: params.applyMessages,
            applyPageState: (pageState) => {
                if (pageState.firstSeq !== undefined) {
                    params.setFirstSeq(pageState.firstSeq);
                }
                if (pageState.lastSeq !== undefined) {
                    params.setLastSeq(pageState.lastSeq);
                }
                params.setHasMoreBefore(pageState.hasMoreBefore);
            },
            recordSuccess: params.recordSuccess,
            applyHistoryState: params.applyHistoryState,
            applyLifecycleThinkingState: params.applyLifecycleThinkingState,
            markLoaded: params.markLoaded,
        });
    }

    const catchupResult = await runMessageCatchup({
        initialAfterSeq: params.initialAfterSeq,
        commitThreshold: MESSAGE_CATCHUP_COMMIT_SIZE,
        fetchPage: (afterSeq) => params.fetchPage(
            `/v3/sessions/${params.sessionId}/messages?after_seq=${afterSeq}&limit=100`,
            params.request,
        ),
        processPage: (messages) => params.processPage(messages, params.request),
        commitBatch: ({ messages, minSeq, maxSeq }) => {
            params.request.assertCurrent();
            if (messages.length > 0) {
                params.applyMessages(messages);
            }
            const pageState = applyCatchupMessagesChunk({
                currentFirstSeq: params.currentFirstSeq(),
                currentLastSeq: params.currentLastSeq(),
                processedMinSeq: minSeq,
                processedMaxSeq: maxSeq,
            });
            if (pageState.firstSeq !== undefined) {
                params.setFirstSeq(pageState.firstSeq);
            }
            if (pageState.lastSeq !== undefined) {
                params.setLastSeq(pageState.lastSeq);
            }
        },
        assertCurrent: params.request.assertCurrent,
        logStalled: params.logStalled,
    });

    // The catch-up worker's final assertion runs before its promise resolves.
    // Re-check after that await so an account switch cannot let the old
    // generation project thinking/loaded state into the new account.
    params.request.assertCurrent();
    params.applyLifecycleThinkingState(catchupResult.lifecycleThinkingState);
    params.markLoaded();
    return catchupResult.totalNormalized;
}
