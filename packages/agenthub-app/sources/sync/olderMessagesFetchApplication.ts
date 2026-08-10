import type { ApiMessage } from './apiTypes';
import type { ProcessedMessagePage } from './messagePageApplication';
import { runOlderMessagesLifecycle } from './olderMessagesLifecycle';
import { runOlderMessagePage } from './messageOlderPageRunner';
import type { OlderMessagesPageResult } from './olderMessagesPageApplication';
import type { NormalizedMessage } from './typesRaw';

export type OlderMessagesFetchRequest = {
    signal: AbortSignal;
    assertCurrent: () => void;
};

export type OlderMessagesFetchApplicationParams<Request extends OlderMessagesFetchRequest = OlderMessagesFetchRequest> = {
    sessionId: string;
    beforeSeq: number;
    runRequest: (operation: (request: Request) => Promise<number>) => Promise<number>;
    runInLock: (operation: () => Promise<number>) => Promise<number>;
    fetchPage: (path: string, signal: AbortSignal) => Promise<{ messages: ApiMessage[]; hasMore: boolean }>;
    processPage: (messages: ApiMessage[], request: Request) => Promise<ProcessedMessagePage>;
    /** Read only after the per-session lock is acquired. */
    currentFirstSeq: () => number | undefined;
    currentLastSeq: () => number | undefined;
    applyMessages: (messages: NormalizedMessage[]) => void;
    applyPageState: (state: OlderMessagesPageResult) => void;
    recordSuccess: () => void;
    applyHistoryState: (state: { hasMoreBefore: boolean; isLoadingBefore: false }) => void;
    applyLoading: () => void;
    resetLoading: () => void;
    applyFailure: () => void;
    isCurrent: () => boolean;
};

/** Run one older-message fetch without coupling request/lock state to Sync. */
export async function runOlderMessagesFetchApplication<Request extends OlderMessagesFetchRequest>(
    params: OlderMessagesFetchApplicationParams<Request>,
): Promise<number> {
    params.applyLoading();
    return runOlderMessagesLifecycle<Request>({
            runRequest: params.runRequest,
            runInLock: params.runInLock,
            runPage: async (request) => {
                request.assertCurrent();
                return runOlderMessagePage({
                    currentFirstSeq: params.currentFirstSeq(),
                    currentLastSeq: params.currentLastSeq(),
                    fetchPage: () => params.fetchPage(
                        `/v3/sessions/${params.sessionId}/messages?direction=backward&before_seq=${params.beforeSeq}&limit=100`,
                        request.signal,
                    ),
                    processPage: (messages) => params.processPage(messages, request),
                    assertCurrent: request.assertCurrent,
                    applyMessages: params.applyMessages,
                    applyPageState: params.applyPageState,
                    recordSuccess: params.recordSuccess,
                    applyHistoryState: params.applyHistoryState,
                });
            },
            isCurrent: params.isCurrent,
            onFailure: params.applyFailure,
            onResetLoading: params.resetLoading,
        });
}
