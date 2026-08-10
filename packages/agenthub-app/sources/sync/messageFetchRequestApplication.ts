import { getMessageFetchMode } from './messageFetchMode';
import {
    runMessageFetchPages,
    type MessageFetchPagesParams,
} from './messageFetchPageApplication';

type MessageFetchRequest = {
    signal: AbortSignal;
    assertCurrent: () => void;
};

export type MessageFetchRequestApplicationParams<Request extends MessageFetchRequest = MessageFetchRequest> = {
    sessionId: string;
    request: Request;
    getSessionEncryption: () => unknown;
    getLastSeq: () => number;
    hasLocalMessages: () => boolean;
    pages: Omit<MessageFetchPagesParams<Request>, 'mode' | 'sessionId' | 'initialAfterSeq' | 'request'>;
    onMissingEncryption: (message: string) => void;
    onCompleted: (mode: 'latest' | 'catchup', processedCount: number) => void;
    runPages?: (params: MessageFetchPagesParams<Request>) => Promise<number>;
};

/** Own the request-local message mode decision and page-runner wiring. */
export async function runMessageFetchRequestApplication<
    Request extends MessageFetchRequest,
>(params: MessageFetchRequestApplicationParams<Request>): Promise<void> {
    params.request.assertCurrent();
    if (!params.getSessionEncryption()) {
        const message = `Session encryption not ready for ${params.sessionId}`;
        params.onMissingEncryption(message);
        throw new Error(message);
    }

    const initialAfterSeq = params.getLastSeq();
    const mode = getMessageFetchMode({
        afterSeq: initialAfterSeq,
        hasLocalMessages: params.hasLocalMessages(),
    });
    const runPages = params.runPages ?? runMessageFetchPages;
    const processedCount = await runPages({
        ...params.pages,
        mode,
        sessionId: params.sessionId,
        initialAfterSeq,
        request: params.request,
    });
    params.onCompleted(mode, processedCount);
}
