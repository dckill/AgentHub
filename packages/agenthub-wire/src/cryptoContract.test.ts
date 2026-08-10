import { describe, expect, it } from 'vitest';
import {
    ANALYTICS_KEY_DERIVATION_USAGE,
    BLOB_KEY_DERIVATION_USAGE,
    CONTENT_KEY_DERIVATION_USAGE,
    DATA_KEY_BUNDLE_VERSION,
    DATA_KEY_AUTH_TAG_BYTES,
    DATA_KEY_NONCE_BYTES,
    DATA_KEY_HEADER_BYTES,
    DATA_KEY_MIN_BUNDLE_BYTES,
    packDataKeyBundle,
    unpackDataKeyBundle,
} from './cryptoContract';

describe('shared data-key bundle contract', () => {
    it('defines the version-0 AES-GCM layout used by CLI and Agent', () => {
        expect(DATA_KEY_BUNDLE_VERSION).toBe(0);
        expect(DATA_KEY_NONCE_BYTES).toBe(12);
        expect(DATA_KEY_AUTH_TAG_BYTES).toBe(16);
        expect(DATA_KEY_HEADER_BYTES).toBe(1 + DATA_KEY_NONCE_BYTES);
    });

    it('keeps derivation domain labels stable across packages', () => {
        expect(CONTENT_KEY_DERIVATION_USAGE).toBe('AgentHub EnCoder');
        expect(BLOB_KEY_DERIVATION_USAGE).toBe('AgentHub Blobs');
        expect(ANALYTICS_KEY_DERIVATION_USAGE).toBe('AgentHub');
    });

    it('round-trips the versioned layout without aliasing input buffers', () => {
        const parts = {
            nonce: Uint8Array.from({ length: DATA_KEY_NONCE_BYTES }, (_, index) => index),
            ciphertext: Uint8Array.from([10, 20, 30]),
            authTag: Uint8Array.from({ length: DATA_KEY_AUTH_TAG_BYTES }, (_, index) => 100 + index),
        };

        const bundle = packDataKeyBundle(parts);
        expect(bundle.length).toBe(DATA_KEY_MIN_BUNDLE_BYTES + parts.ciphertext.length);
        expect(unpackDataKeyBundle(bundle)).toEqual(parts);

        parts.nonce[0] = 255;
        expect(unpackDataKeyBundle(bundle)?.nonce[0]).toBe(0);
    });

    it('rejects unsupported versions, truncation, and malformed nonce/tag sizes', () => {
        expect(unpackDataKeyBundle(new Uint8Array(DATA_KEY_MIN_BUNDLE_BYTES - 1))).toBeNull();
        expect(unpackDataKeyBundle(Uint8Array.from([99, ...new Uint8Array(DATA_KEY_MIN_BUNDLE_BYTES)]))).toBeNull();
        expect(() => packDataKeyBundle({
            nonce: new Uint8Array(DATA_KEY_NONCE_BYTES - 1),
            ciphertext: new Uint8Array(),
            authTag: new Uint8Array(DATA_KEY_AUTH_TAG_BYTES),
        })).toThrow(/nonce/);
        expect(() => packDataKeyBundle({
            nonce: new Uint8Array(DATA_KEY_NONCE_BYTES),
            ciphertext: new Uint8Array(),
            authTag: new Uint8Array(DATA_KEY_AUTH_TAG_BYTES - 1),
        })).toThrow(/auth tag/);
    });
});
