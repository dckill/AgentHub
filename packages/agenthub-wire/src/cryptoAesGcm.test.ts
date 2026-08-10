import { describe, expect, it } from 'vitest';
import { decryptDataKeyBundle, encryptDataKeyBundle } from './cryptoAesGcm';

const key = new Uint8Array(32);
const nonce = new Uint8Array(12);
const plaintext = new TextEncoder().encode('AgentHub AES-GCM vector');

function hex(value: Uint8Array): string {
    return Buffer.from(value).toString('hex');
}

describe('shared AES-GCM contract', () => {
    it('matches the fixed version-0 AES-256-GCM vector', () => {
        const bundle = encryptDataKeyBundle(plaintext, key, nonce);

        expect(hex(bundle)).toBe(
            '000000000000000000000000008fc0255339281e0c270f808097b4de55521666a943c95885a5db55d828dca887e09eb34d10bcde',
        );
        expect(decryptDataKeyBundle(bundle, key)).toEqual(plaintext);
    });

    it('fails closed for tampered ciphertext and rejects invalid key/nonce sizes', () => {
        const bundle = encryptDataKeyBundle(plaintext, key, nonce);
        bundle[13] ^= 1;
        expect(decryptDataKeyBundle(bundle, key)).toBeNull();
        expect(() => encryptDataKeyBundle(plaintext, new Uint8Array(31), nonce)).toThrow(/key/);
        expect(() => encryptDataKeyBundle(plaintext, key, new Uint8Array(11))).toThrow(/nonce/);
    });
});
