import { describe, expect, it, vi } from 'vitest';
import type { ApiMessage } from './apiTypes';
import { decryptRealtimeMessage } from './newMessageDecryptionApplication';

const message: ApiMessage = {
    id: 'message-1',
    seq: 4,
    localId: null,
    content: { t: 'encrypted', c: 'ciphertext' },
    createdAt: 10,
    updatedAt: 10,
};

describe('decryptRealtimeMessage', () => {
    it('returns a recoverable failure when decryption throws', async () => {
        const result = await decryptRealtimeMessage({
            message,
            decrypt: vi.fn().mockRejectedValue(new Error('temporary key failure')),
            assertCurrent: vi.fn(),
        });

        expect(result.kind).toBe('failed');
        expect(result).toMatchObject({ error: expect.any(Error) });
    });

    it('keeps a null decryption result distinct from a thrown failure', async () => {
        const result = await decryptRealtimeMessage({
            message,
            decrypt: vi.fn().mockResolvedValue(null),
            assertCurrent: vi.fn(),
        });

        expect(result).toEqual({ kind: 'empty' });
    });

    it('normalizes a successfully decrypted message without hiding invalid content', async () => {
        const assertCurrent = vi.fn();
        const result = await decryptRealtimeMessage({
            message,
            decrypt: vi.fn().mockResolvedValue({
                id: 'message-1',
                seq: 4,
                localId: null,
                createdAt: 10,
                content: { role: 'user', content: { type: 'text', text: 'hello' } },
            }),
            assertCurrent,
        });

        expect(result.kind).toBe('applied');
        expect(result).toMatchObject({
            decrypted: { id: 'message-1' },
            normalized: { id: 'message-1', role: 'user' },
        });
        expect(assertCurrent).toHaveBeenCalledTimes(1);
    });
});
