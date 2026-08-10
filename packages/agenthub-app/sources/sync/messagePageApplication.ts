import type { ApiMessage } from './apiTypes';
import type { DecryptedMessage } from './storageTypes';
import { getMessagePageBounds } from './messagePageBounds';
import { projectDecryptedMessages } from './messagePageProjection';
import type { NormalizedMessage } from './typesRaw';

export type MessagePageEncryption = {
    decryptMessages: (messages: ApiMessage[]) => Promise<(DecryptedMessage | null)[]>;
};

export type ProcessedMessagePage = {
    normalizedMessages: NormalizedMessage[];
    minSeq: number | null;
    maxSeq: number | null;
    lifecycleThinkingState: boolean | null;
};

/** Decrypt and project one message page while preserving retryable crypto misses. */
export async function processMessagePage(params: {
    sessionId: string;
    messages: ApiMessage[];
    encryption: MessagePageEncryption | null;
    assertCurrent: () => void;
}): Promise<ProcessedMessagePage> {
    params.assertCurrent();
    if (!params.encryption) {
        throw new Error(`Session encryption not ready for ${params.sessionId}`);
    }

    const { minSeq, maxSeq } = getMessagePageBounds(params.messages);
    const decryptedMessages = await params.encryption.decryptMessages(params.messages);
    params.assertCurrent();
    const hasDecryptionMiss = params.messages.some((message, index) => (
        message.content.t === 'encrypted' && decryptedMessages[index]?.content === null
    ));
    if (hasDecryptionMiss) {
        throw new Error(`Failed to decrypt one or more messages for ${params.sessionId}`);
    }

    const { normalizedMessages, lifecycleThinkingState } = projectDecryptedMessages(
        decryptedMessages.filter((message): message is NonNullable<typeof message> => Boolean(message)),
    );

    return { normalizedMessages, minSeq, maxSeq, lifecycleThinkingState };
}
