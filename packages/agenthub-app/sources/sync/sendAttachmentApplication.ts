import { createAttachmentFileRecord, type UploadedImageAttachment } from './attachmentMessage';
import type { RawRecord } from './typesRaw';
import type { OutboxMessage } from './outboxService';

export type EnqueueUploadedAttachmentsParams<NormalizedMessage> = {
    sessionId: string;
    attachments: UploadedImageAttachment[];
    createId: () => string;
    now: () => number;
    encryptRawRecord: (record: RawRecord) => Promise<string>;
    normalizeRawMessage: (
        localId: string,
        messageId: string,
        createdAt: number,
        record: RawRecord,
    ) => NormalizedMessage | null;
    enqueueMessages: (sessionId: string, messages: NormalizedMessage[]) => void;
    enqueueOutbox: (sessionId: string, message: OutboxMessage) => void;
    isCurrent?: () => boolean;
};

/** Persist uploaded image records in the local projection and send outbox. */
export async function enqueueUploadedAttachments<NormalizedMessage>({
    sessionId,
    attachments,
    createId,
    now,
    encryptRawRecord,
    normalizeRawMessage: normalize,
    enqueueMessages,
    enqueueOutbox,
    isCurrent: isCurrentParam,
}: EnqueueUploadedAttachmentsParams<NormalizedMessage>): Promise<void> {
    const isCurrent = isCurrentParam ?? (() => true);
    for (const attachment of attachments) {
        if (!isCurrent()) return;
        const fileLocalId = createId();
        const fileRecord = createAttachmentFileRecord(attachment, createId(), now());
        const encryptedFileRecord = await encryptRawRecord(fileRecord);
        if (!isCurrent()) return;
        const normalized = normalize(fileLocalId, fileLocalId, now(), fileRecord);
        if (normalized) {
            enqueueMessages(sessionId, [normalized]);
        }
        enqueueOutbox(sessionId, { localId: fileLocalId, content: encryptedFileRecord });
    }
}
