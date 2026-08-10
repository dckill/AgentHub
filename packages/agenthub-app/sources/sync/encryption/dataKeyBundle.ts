import {
    DATA_KEY_AUTH_TAG_BYTES,
    DATA_KEY_NONCE_BYTES,
    packDataKeyBundle,
    unpackDataKeyBundle,
} from '@artsum/agenthub-wire';

/** Wrap native AES-GCM output (nonce + ciphertext + auth tag) in the wire version byte. */
export function wrapDataKeyBundle(encrypted: Uint8Array): Uint8Array {
    if (encrypted.length < DATA_KEY_NONCE_BYTES + DATA_KEY_AUTH_TAG_BYTES) {
        throw new Error('AES-GCM payload is shorter than the wire minimum');
    }
    return packDataKeyBundle({
        nonce: encrypted.slice(0, DATA_KEY_NONCE_BYTES),
        ciphertext: encrypted.slice(DATA_KEY_NONCE_BYTES, encrypted.length - DATA_KEY_AUTH_TAG_BYTES),
        authTag: encrypted.slice(encrypted.length - DATA_KEY_AUTH_TAG_BYTES),
    });
}

/** Remove and validate the wire version byte before passing data to native AES-GCM. */
export function unwrapDataKeyBundle(bundle: Uint8Array): Uint8Array | null {
    const parts = unpackDataKeyBundle(bundle);
    if (!parts) return null;
    const raw = new Uint8Array(parts.nonce.length + parts.ciphertext.length + parts.authTag.length);
    raw.set(parts.nonce, 0);
    raw.set(parts.ciphertext, parts.nonce.length);
    raw.set(parts.authTag, parts.nonce.length + parts.ciphertext.length);
    return raw;
}
