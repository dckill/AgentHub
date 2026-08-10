import { describe, expect, it, vi } from 'vitest';
import type { UploadedImageAttachment } from './attachmentMessage';
import { enqueueUploadedAttachments } from './sendAttachmentApplication';

const attachments: UploadedImageAttachment[] = [
    { ref: 'ref-1', name: 'one.png', size: 10, mimeType: 'image/png', width: 20, height: 30 },
    { ref: 'ref-2', name: 'two.jpg', size: 20, mimeType: 'image/jpeg' },
];

describe('enqueueUploadedAttachments', () => {
    it('encrypts each uploaded file, projects it locally, and queues it for sending', async () => {
        const encrypted = vi.fn(async (record: unknown) => JSON.stringify(record));
        const normalize = vi.fn((localId: string, messageId: string, createdAt: number, record: unknown) => ({
            localId,
            messageId,
            createdAt,
            record,
        }));
        const enqueueMessages = vi.fn();
        const enqueueOutbox = vi.fn();
        let id = 0;
        let now = 1000;

        await enqueueUploadedAttachments({
            sessionId: 'session-1',
            attachments,
            createId: () => `id-${++id}`,
            now: () => now++,
            encryptRawRecord: encrypted,
            normalizeRawMessage: normalize,
            enqueueMessages,
            enqueueOutbox,
        });

        expect(encrypted).toHaveBeenCalledTimes(2);
        expect(normalize).toHaveBeenCalledTimes(2);
        expect(enqueueMessages).toHaveBeenCalledTimes(2);
        expect(enqueueOutbox).toHaveBeenCalledTimes(2);
        expect(enqueueOutbox).toHaveBeenNthCalledWith(1, 'session-1', {
            localId: 'id-1',
            content: expect.any(String),
        });
        expect(enqueueOutbox).toHaveBeenNthCalledWith(2, 'session-1', {
            localId: 'id-3',
            content: expect.any(String),
        });
    });

    it('still queues encrypted attachments when local normalization rejects one', async () => {
        const enqueueMessages = vi.fn();
        const enqueueOutbox = vi.fn();

        await enqueueUploadedAttachments({
            sessionId: 'session-1',
            attachments: [attachments[0]],
            createId: () => 'id-1',
            now: () => 1000,
            encryptRawRecord: async () => 'encrypted',
            normalizeRawMessage: () => null,
            enqueueMessages,
            enqueueOutbox,
        });

        expect(enqueueMessages).not.toHaveBeenCalled();
        expect(enqueueOutbox).toHaveBeenCalledOnce();
    });

    it('stops attachment projection when the account becomes stale during encryption', async () => {
        let currentGeneration = true;
        const enqueueMessages = vi.fn();
        const enqueueOutbox = vi.fn();

        await enqueueUploadedAttachments({
            sessionId: 'session-1',
            attachments,
            createId: () => 'id-1',
            now: () => 1000,
            encryptRawRecord: async () => {
                currentGeneration = false;
                return 'encrypted';
            },
            normalizeRawMessage: () => ({ id: 'message-1' }),
            enqueueMessages,
            enqueueOutbox,
            isCurrent: () => currentGeneration,
        });

        expect(enqueueMessages).not.toHaveBeenCalled();
        expect(enqueueOutbox).not.toHaveBeenCalled();
    });
});
