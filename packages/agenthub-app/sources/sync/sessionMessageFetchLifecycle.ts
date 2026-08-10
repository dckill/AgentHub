import type { AuthCredentials } from '@/auth/tokenStorage';
import type { ApiMessage } from './apiTypes';
import type { AccountRequest } from './accountLifecycle';
import {
    runMessageFetchRequestApplication,
    type MessageFetchRequestApplicationParams,
} from './messageFetchRequestApplication';
import { runMessageFetchLifecycle } from './messageFetchLifecycle';
import type { MessageFetchPagesParams } from './messageFetchPageApplication';
import type { ProcessedMessagePage } from './messagePageApplication';
import type { NormalizedMessage } from './typesRaw';
import type { SessionMessageLoadError } from './sessionMessageLoadState';

type MessageFetchRequest = {
    signal: AbortSignal;
    assertCurrent: () => void;
};

export type SessionMessageFetchOptions = {
    generation: number;
    sessionId: string;
    credentials: AuthCredentials;
    runRequest: <T>(
        generation: number,
        operation: (request: AccountRequest) => Promise<T>,
    ) => Promise<T>;
    runInLock: (operation: () => Promise<void>) => Promise<void>;
    getSessionEncryption: () => unknown;
    getLastSeq: () => number;
    hasLocalMessages: () => boolean;
    fetchPage: (
        path: string,
        request: MessageFetchRequest,
        credentials: AuthCredentials,
    ) => Promise<{ messages: ApiMessage[]; hasMore: boolean }>;
    processPage: (messages: ApiMessage[], request: AccountRequest) => Promise<ProcessedMessagePage>;
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
    classifyError: (error: unknown) => SessionMessageLoadError | null;
    isCurrent: () => boolean;
    applyLoadError: (error: SessionMessageLoadError) => void;
    onMissingEncryption: (message: string) => void;
    onCompleted: (mode: 'latest' | 'catchup', processedCount: number) => void;
    logStalled: () => void;
    runPages?: MessageFetchRequestApplicationParams<AccountRequest>['runPages'];
};

/** Bind initial message loading to account generation, ingest lock and page application. */
export async function runSessionMessageFetch(
    options: SessionMessageFetchOptions,
): Promise<void> {
    await runMessageFetchLifecycle<AccountRequest>({
        runRequest: (operation) => options.runRequest(options.generation, operation),
        runInLock: options.runInLock,
        runPage: (request) => runMessageFetchRequestApplication({
            sessionId: options.sessionId,
            request,
            getSessionEncryption: options.getSessionEncryption,
            getLastSeq: options.getLastSeq,
            hasLocalMessages: options.hasLocalMessages,
            onMissingEncryption: options.onMissingEncryption,
            onCompleted: options.onCompleted,
            runPages: options.runPages,
            pages: {
                fetchPage: (path, pageRequest) => options.fetchPage(path, pageRequest, options.credentials),
                processPage: options.processPage,
                currentFirstSeq: options.currentFirstSeq,
                currentLastSeq: options.currentLastSeq,
                applyMessages: options.applyMessages,
                setFirstSeq: options.setFirstSeq,
                setLastSeq: options.setLastSeq,
                setHasMoreBefore: options.setHasMoreBefore,
                recordSuccess: options.recordSuccess,
                applyHistoryState: options.applyHistoryState,
                applyLifecycleThinkingState: options.applyLifecycleThinkingState,
                markLoaded: options.markLoaded,
                logStalled: options.logStalled,
            } satisfies Omit<MessageFetchPagesParams<AccountRequest>, 'mode' | 'sessionId' | 'initialAfterSeq' | 'request'>,
        }),
        classifyError: options.classifyError,
        isCurrent: options.isCurrent,
        applyLoadError: options.applyLoadError,
    });
}
