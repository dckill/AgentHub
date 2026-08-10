import type { OutboxMessage } from './outboxService';
import type { RawRecord } from './typesRaw';

export type EnqueueTextMessageParams<Content extends RawRecord, NormalizedMessage> = {
    sessionId: string;
    content: Content;
    createId: () => string;
    now: () => number;
    encryptRawRecord: (record: Content) => Promise<string>;
    normalizeRawMessage: (
        localId: string,
        messageId: string,
        createdAt: number,
        record: Content,
    ) => NormalizedMessage | null;
    enqueueMessages: (sessionId: string, messages: NormalizedMessage[]) => void;
    enqueueOutbox: (sessionId: string, message: OutboxMessage) => void;
    isCurrent?: () => boolean;
};

/** Encrypt and project a user text record before adding it to the send outbox. */
export async function enqueueTextMessage<Content extends RawRecord, NormalizedMessage>({
    sessionId,
    content,
    createId,
    now,
    encryptRawRecord,
    normalizeRawMessage,
    enqueueMessages,
    enqueueOutbox,
    isCurrent: isCurrentParam,
}: EnqueueTextMessageParams<Content, NormalizedMessage>): Promise<{ localId: string }> {
    const isCurrent = isCurrentParam ?? (() => true);
    if (!isCurrent()) return { localId: '' };
    const localId = createId();
    const encryptedRawRecord = await encryptRawRecord(content);
    if (!isCurrent()) return { localId };
    const normalizedMessage = normalizeRawMessage(localId, localId, now(), content);
    if (normalizedMessage) {
        enqueueMessages(sessionId, [normalizedMessage]);
    }
    enqueueOutbox(sessionId, { localId, content: encryptedRawRecord });
    return { localId };
}
