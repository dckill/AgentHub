import { describe, expect, it, vi } from 'vitest';
import type { ApiMessage } from './apiTypes';
import { processMessagePage } from './messagePageApplication';

const encryptedMessage: ApiMessage = {
    id: 'message-1', seq: 4, localId: null, createdAt: 10, updatedAt: 10,
    content: { t: 'encrypted', c: 'ciphertext' },
};

describe('processMessagePage', () => {
    it('fails closed when an encrypted record has no decrypted payload', async () => {
        await expect(processMessagePage({
            sessionId: 'session-1',
            messages: [encryptedMessage],
            encryption: { decryptMessages: vi.fn().mockResolvedValue([{
                id: encryptedMessage.id,
                seq: encryptedMessage.seq,
                localId: null,
                createdAt: encryptedMessage.createdAt,
                content: null,
            }]) },
            assertCurrent: vi.fn(),
        })).rejects.toThrow('Failed to decrypt one or more messages for session-1');
    });

    it('keeps non-encrypted records compatible with normalization', async () => {
        const message: ApiMessage = {
            id: 'message-2', seq: 5, localId: null, createdAt: 11, updatedAt: 11,
            content: { t: 'text', role: 'user', text: 'hello' } as unknown as ApiMessage['content'],
        };
        const result = await processMessagePage({
            sessionId: 'session-1',
            messages: [message],
            encryption: { decryptMessages: vi.fn().mockResolvedValue([{
                id: message.id, seq: message.seq, localId: null, createdAt: message.createdAt,
                content: { role: 'user', content: { type: 'text', text: 'hello' } },
            }]) },
            assertCurrent: vi.fn(),
        });

        expect(result.normalizedMessages).toHaveLength(1);
        expect(result.minSeq).toBe(5);
        expect(result.maxSeq).toBe(5);
    });
});
