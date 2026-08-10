import type { ApiMessage } from './apiTypes';
import type { AccountRequest } from './accountLifecycle';
import {
    processMessagePage,
    type MessagePageEncryption,
    type ProcessedMessagePage,
} from './messagePageApplication';

type AccountEncryption = {
    getSessionEncryption: (sessionId: string) => MessagePageEncryption | null;
};

export type MessagePageLifecycleOptions = {
    sessionId: string;
    messages: ApiMessage[];
    request: AccountRequest;
    accountEncryption: AccountEncryption | null;
    processPage?: typeof processMessagePage;
};

/** Bind message-page decryption to the current account generation and session key. */
export async function runMessagePageLifecycle(
    options: MessagePageLifecycleOptions,
): Promise<ProcessedMessagePage> {
    options.request.assertCurrent();
    if (!options.accountEncryption) {
        throw new DOMException('Account lifecycle is stale', 'AbortError');
    }

    const runPage = options.processPage ?? processMessagePage;
    return runPage({
        sessionId: options.sessionId,
        messages: options.messages,
        encryption: options.accountEncryption.getSessionEncryption(options.sessionId),
        assertCurrent: options.request.assertCurrent,
    });
}
