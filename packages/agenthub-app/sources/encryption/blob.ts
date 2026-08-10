import sodium from '@/encryption/libsodium.lib';
import { getRandomBytes } from 'expo-crypto';

/** Binary secretbox format: nonce(24) + authenticated ciphertext. */
export function encryptBlob(data: Uint8Array, key: Uint8Array): Uint8Array {
    const nonce = getRandomBytes(sodium.crypto_secretbox_NONCEBYTES);
    const plaintext = data.byteOffset === 0 && data.buffer.byteLength === data.length ? data : data.slice();
    const standaloneKey = key.byteOffset === 0 && key.buffer.byteLength === key.length ? key : key.slice();
    const encrypted = sodium.crypto_secretbox_easy(plaintext, nonce, standaloneKey);
    const result = new Uint8Array(nonce.length + encrypted.length);
    result.set(nonce, 0);
    result.set(encrypted, nonce.length);
    return result;
}

export function decryptBlob(bundle: Uint8Array, key: Uint8Array): Uint8Array | null {
    if (bundle.length < sodium.crypto_secretbox_NONCEBYTES + 16) return null;
    const standaloneKey = key.byteOffset === 0 && key.buffer.byteLength === key.length ? key : key.slice();
    try {
        return sodium.crypto_secretbox_open_easy(
            bundle.slice(sodium.crypto_secretbox_NONCEBYTES),
            bundle.slice(0, sodium.crypto_secretbox_NONCEBYTES),
            standaloneKey,
        );
    } catch {
        return null;
    }
}
