import type { AuthCredentials } from '@/auth/tokenStorage';
import type { ApiMessage } from './apiTypes';
import type { AccountRequest } from './accountLifecycle';
import {
    runOlderMessagesFetchApplication,
    type OlderMessagesFetchApplicationParams,
} from './olderMessagesFetchApplication';
import type { ProcessedMessagePage } from './messagePageApplication';
import type { NormalizedMessage } from './typesRaw';

export type SessionOlderMessagesFetchOptions = {
    generation: number;
    sessionId: string;
    beforeSeq: number;
    credentials: AuthCredentials;
    runRequest: (
        generation: number,
        operation: (request: AccountRequest) => Promise<number>,
    ) => Promise<number>;
    runInLock: (operation: () => Promise<number>) => Promise<number>;
    fetchPage: (
        path: string,
        signal: AbortSignal,
        credentials: AuthCredentials,
    ) => Promise<{ messages: ApiMessage[]; hasMore: boolean }>;
    processPage: (messages: ApiMessage[], request: AccountRequest) => Promise<ProcessedMessagePage>;
    currentFirstSeq: () => number | undefined;
    currentLastSeq: () => number | undefined;
    applyMessages: (messages: NormalizedMessage[]) => void;
    applyPageState: (state: { firstSeq?: number; lastSeq?: number; hasMoreBefore: boolean }) => void;
    recordSuccess: () => void;
    applyHistoryState: (state: { hasMoreBefore: boolean; isLoadingBefore: false }) => void;
    applyLoading: () => void;
    resetLoading: () => void;
    applyFailure: () => void;
    isCurrent: () => boolean;
};

/** Bind backward message pagination to account generation and session resources. */
export async function runSessionOlderMessagesFetch(
    options: SessionOlderMessagesFetchOptions,
): Promise<number> {
    return runOlderMessagesFetchApplication<AccountRequest>({
        sessionId: options.sessionId,
        beforeSeq: options.beforeSeq,
        runRequest: (operation) => options.runRequest(options.generation, operation),
        runInLock: options.runInLock,
        fetchPage: (path, signal) => options.fetchPage(path, signal, options.credentials),
        processPage: options.processPage,
        currentFirstSeq: options.currentFirstSeq,
        currentLastSeq: options.currentLastSeq,
        applyMessages: options.applyMessages,
        applyPageState: options.applyPageState,
        recordSuccess: options.recordSuccess,
        applyHistoryState: options.applyHistoryState,
        applyLoading: options.applyLoading,
        resetLoading: options.resetLoading,
        applyFailure: options.applyFailure,
        isCurrent: options.isCurrent,
    } satisfies OlderMessagesFetchApplicationParams<AccountRequest>);
}
