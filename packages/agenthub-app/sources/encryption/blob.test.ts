import { beforeAll, describe, expect, it, vi } from 'vitest';
import sodium from 'libsodium-wrappers';

vi.mock('expo-crypto', () => ({
    getRandomBytes: (length: number) => new Uint8Array(require('node:crypto').randomBytes(length)),
}));
vi.mock('@/encryption/libsodium.lib', () => ({ default: require('libsodium-wrappers') }));

import { decryptBlob, encryptBlob } from './blob';

const key = new Uint8Array(32).map((_, index) => index);

beforeAll(async () => sodium.ready);

describe('attachment blob encryption', () => {
    it('round-trips binary data without JSON encoding', () => {
        const data = new Uint8Array([0, 1, 255, 0, 128]);
        const encrypted = encryptBlob(data, key);
        expect(encrypted.length).toBe(data.length + 40);
        expect(decryptBlob(encrypted, key)).toEqual(data);
    });

    it('uses a fresh nonce and rejects wrong keys or corruption', () => {
        const data = new Uint8Array([1, 2, 3]);
        const first = encryptBlob(data, key);
        const second = encryptBlob(data, key);
        expect(first).not.toEqual(second);
        expect(decryptBlob(first, new Uint8Array(32).fill(9))).toBeNull();
        first[first.length - 1] ^= 0xff;
        expect(decryptBlob(first, key)).toBeNull();
    });
});
