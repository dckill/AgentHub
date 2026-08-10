import { createHash, randomBytes } from 'node:crypto';
import tweetnacl from 'tweetnacl';
import {
    CONTENT_KEY_DERIVATION_USAGE,
    DATA_KEY_NONCE_BYTES,
    deriveKey as deriveSharedKey,
    deriveSecretKeyTreeChild as deriveSharedChild,
    deriveSecretKeyTreeRoot as deriveSharedRoot,
    decryptDataKeyBundle,
    encryptDataKeyBundle,
    hmacSha512,
    type KeyTreeState,
} from '@artsum/agenthub-wire';

// --- Base64 encoding/decoding ---

export function encodeBase64(buffer: Uint8Array): string {
    return Buffer.from(buffer).toString('base64');
}

export function decodeBase64(base64: string): Uint8Array {
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function encodeBase64Url(buffer: Uint8Array): string {
    return Buffer.from(buffer)
        .toString('base64')
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replaceAll('=', '');
}

export function decodeBase64Url(base64url: string): Uint8Array {
    const base64 = base64url
        .replaceAll('-', '+')
        .replaceAll('_', '/')
        + '='.repeat((4 - base64url.length % 4) % 4);
    return new Uint8Array(Buffer.from(base64, 'base64'));
}

export function getRandomBytes(size: number): Uint8Array {
    return new Uint8Array(randomBytes(size));
}

// --- Key derivation tree ---

export type { KeyTreeState } from '@artsum/agenthub-wire';

/** Compatibility aliases retained for Agent callers; the implementation lives in Wire. */
export const hmac_sha512 = hmacSha512;
export const deriveSecretKeyTreeRoot = deriveSharedRoot;
export const deriveSecretKeyTreeChild = deriveSharedChild;
export const deriveKey = deriveSharedKey;

export function deriveContentKeyPair(secret: Uint8Array): { publicKey: Uint8Array; secretKey: Uint8Array } {
    const seed = deriveKey(secret, CONTENT_KEY_DERIVATION_USAGE, ['content']);
    // libsodium's crypto_box_seed_keypair does SHA-512(seed)[0:32] internally
    const hashedSeed = new Uint8Array(createHash('sha512').update(seed).digest());
    const boxSecretKey = hashedSeed.slice(0, 32);
    const keyPair = tweetnacl.box.keyPair.fromSecretKey(boxSecretKey);
    return { publicKey: keyPair.publicKey, secretKey: keyPair.secretKey };
}

// --- AES-256-GCM encryption ---

export function encryptWithDataKey(data: unknown, dataKey: Uint8Array): Uint8Array {
    const nonce = getRandomBytes(DATA_KEY_NONCE_BYTES);
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    return encryptDataKeyBundle(plaintext, dataKey, nonce);
}

export function decryptWithDataKey(bundle: Uint8Array, dataKey: Uint8Array): unknown | null {
    try {
        const decrypted = decryptDataKeyBundle(bundle, dataKey);
        return decrypted ? JSON.parse(new TextDecoder().decode(decrypted)) : null;
    } catch {
        return null;
    }
}

// --- Legacy TweetNaCl secretbox encryption ---

export function encryptLegacy(data: unknown, secret: Uint8Array): Uint8Array {
    const nonce = getRandomBytes(tweetnacl.secretbox.nonceLength);
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const encrypted = tweetnacl.secretbox(plaintext, nonce, secret);
    const result = new Uint8Array(nonce.length + encrypted.length);
    result.set(nonce);
    result.set(encrypted, nonce.length);
    return result;
}

export function decryptLegacy(data: Uint8Array, secret: Uint8Array): unknown | null {
    try {
        const nonce = data.slice(0, tweetnacl.secretbox.nonceLength);
        const encrypted = data.slice(tweetnacl.secretbox.nonceLength);
        const decrypted = tweetnacl.secretbox.open(encrypted, nonce, secret);
        if (!decrypted) return null;
        return JSON.parse(new TextDecoder().decode(decrypted));
    } catch {
        return null;
    }
}

// --- Encrypt/decrypt dispatcher ---

export function encrypt(key: Uint8Array, variant: 'legacy' | 'dataKey', data: unknown): Uint8Array {
    if (variant === 'legacy') {
        return encryptLegacy(data, key);
    } else {
        return encryptWithDataKey(data, key);
    }
}

export function decrypt(key: Uint8Array, variant: 'legacy' | 'dataKey', data: Uint8Array): unknown | null {
    if (variant === 'legacy') {
        return decryptLegacy(data, key);
    } else {
        return decryptWithDataKey(data, key);
    }
}

// --- Auth challenge (for token refresh) ---

export function authChallenge(secret: Uint8Array): {
    challenge: Uint8Array;
    publicKey: Uint8Array;
    signature: Uint8Array;
} {
    // Derive signing keypair from secret seed
    const signingKeyPair = tweetnacl.sign.keyPair.fromSeed(secret);
    // Create random 32-byte challenge
    const challenge = getRandomBytes(32);
    // Sign the challenge
    const signature = tweetnacl.sign.detached(challenge, signingKeyPair.secretKey);
    return {
        challenge,
        publicKey: signingKeyPair.publicKey,
        signature,
    };
}

// --- NaCl box encryption (public key) ---

export function libsodiumEncryptForPublicKey(data: Uint8Array, recipientPublicKey: Uint8Array): Uint8Array {
    const ephemeralKeyPair = tweetnacl.box.keyPair();
    const nonce = getRandomBytes(tweetnacl.box.nonceLength);
    const encrypted = tweetnacl.box(data, nonce, recipientPublicKey, ephemeralKeyPair.secretKey);

    // Bundle: ephemeral pubkey(32) + nonce(24) + ciphertext
    const result = new Uint8Array(32 + 24 + encrypted.length);
    result.set(ephemeralKeyPair.publicKey, 0);
    result.set(nonce, 32);
    result.set(encrypted, 56);
    return result;
}

export function decryptBoxBundle(bundle: Uint8Array, recipientSecretKey: Uint8Array): Uint8Array | null {
    if (bundle.length < 32 + 24) return null;

    const ephemeralPublicKey = bundle.slice(0, 32);
    const nonce = bundle.slice(32, 56);
    const ciphertext = bundle.slice(56);

    const decrypted = tweetnacl.box.open(ciphertext, nonce, ephemeralPublicKey, recipientSecretKey);
    return decrypted ? new Uint8Array(decrypted) : null;
}
