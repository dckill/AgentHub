import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { decryptAESGCMString, encryptAESGCMString } from './aes';

vi.mock('rn-encryption', () => ({
    encryptAsyncAES: async (data: string, key: string) => {
        const nonce = new Uint8Array(randomBytes(12));
        const cipher = createCipheriv('aes-256-gcm', Buffer.from(key, 'base64'), nonce);
        const ciphertext = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
        return Buffer.concat([Buffer.from(nonce), ciphertext, cipher.getAuthTag()]).toString('base64');
    },
    decryptAsyncAES: async (data: string, key: string) => {
        const combined = Buffer.from(data, 'base64');
        const nonce = combined.subarray(0, 12);
        const ciphertext = combined.subarray(12, combined.length - 16);
        const decipher = createDecipheriv('aes-256-gcm', Buffer.from(key, 'base64'), nonce);
        decipher.setAuthTag(combined.subarray(combined.length - 16));
        return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    },
}));

describe('AES native wrapper', () => {
    it('preserves leading and trailing whitespace in native plaintext', async () => {
        const key = Buffer.alloc(32, 7).toString('base64');
        const plaintext = '  exact native plaintext  ';
        const encrypted = await encryptAESGCMString(plaintext, key);

        await expect(decryptAESGCMString(encrypted, key)).resolves.toEqual(plaintext);
    });
});
