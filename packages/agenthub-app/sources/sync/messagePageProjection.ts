import { getLifecycleThinkingStateFromRawContent } from '@/utils/sessionActivity';
import { NormalizedMessage, normalizeRawMessage } from './typesRaw';
import type { DecryptedMessage } from './storageTypes';

export type MessagePageProjection = {
    normalizedMessages: NormalizedMessage[];
    lifecycleThinkingState: boolean | null;
};

/** Normalize decrypted records for the message store and capture the latest lifecycle state. */
export function projectDecryptedMessages(messages: DecryptedMessage[]): MessagePageProjection {
    const normalizedMessages: NormalizedMessage[] = [];
    let lifecycleThinkingState: boolean | null = null;

    for (const decrypted of messages) {
        const nextLifecycleThinkingState = getLifecycleThinkingStateFromRawContent(decrypted.content);
        if (nextLifecycleThinkingState !== null) {
            lifecycleThinkingState = nextLifecycleThinkingState;
        }

        const normalized = normalizeRawMessage(
            decrypted.id,
            decrypted.localId,
            decrypted.createdAt,
            decrypted.content,
        );
        if (normalized) {
            normalizedMessages.push(normalized);
        }
    }

    return { normalizedMessages, lifecycleThinkingState };
}
