import { gcm } from '@noble/ciphers/aes.js';
import {
    DATA_KEY_AUTH_TAG_BYTES,
    DATA_KEY_NONCE_BYTES,
    packDataKeyBundle,
    unpackDataKeyBundle,
} from './cryptoContract';

export const AES_256_KEY_BYTES = 32 as const;

function assertAesGcmInputs(key: Uint8Array, nonce: Uint8Array): void {
    if (key.length !== AES_256_KEY_BYTES) {
        throw new Error(`AES-256-GCM key must be ${AES_256_KEY_BYTES} bytes`);
    }
    if (nonce.length !== DATA_KEY_NONCE_BYTES) {
        throw new Error(`AES-GCM nonce must be ${DATA_KEY_NONCE_BYTES} bytes`);
    }
}

/** Encrypt raw bytes with the canonical version-0 AES-256-GCM wire layout. */
export function encryptDataKeyBundle(
    plaintext: Uint8Array,
    key: Uint8Array,
    nonce: Uint8Array,
): Uint8Array {
    assertAesGcmInputs(key, nonce);
    const ciphertextWithTag = gcm(key, nonce).encrypt(plaintext);
    const ciphertext = ciphertextWithTag.slice(0, -DATA_KEY_AUTH_TAG_BYTES);
    const authTag = ciphertextWithTag.slice(-DATA_KEY_AUTH_TAG_BYTES);
    return packDataKeyBundle({ nonce, ciphertext, authTag });
}

/** Decrypt a version-0 AES-256-GCM bundle, returning null on any validation/auth failure. */
export function decryptDataKeyBundle(bundle: Uint8Array, key: Uint8Array): Uint8Array | null {
    if (key.length !== AES_256_KEY_BYTES) return null;
    const parts = unpackDataKeyBundle(bundle);
    if (!parts) return null;

    try {
        const ciphertextWithTag = new Uint8Array(parts.ciphertext.length + parts.authTag.length);
        ciphertextWithTag.set(parts.ciphertext, 0);
        ciphertextWithTag.set(parts.authTag, parts.ciphertext.length);
        return gcm(key, parts.nonce).decrypt(ciphertextWithTag);
    } catch {
        return null;
    }
}
