/** Versioned binary layout for data-key AES-GCM bundles. */
export const DATA_KEY_BUNDLE_VERSION = 0 as const;
export const DATA_KEY_NONCE_BYTES = 12 as const;
export const DATA_KEY_AUTH_TAG_BYTES = 16 as const;
export const DATA_KEY_HEADER_BYTES = 1 + DATA_KEY_NONCE_BYTES;
export const DATA_KEY_MIN_BUNDLE_BYTES = DATA_KEY_HEADER_BYTES + DATA_KEY_AUTH_TAG_BYTES;

export interface DataKeyBundleParts {
    nonce: Uint8Array;
    ciphertext: Uint8Array;
    authTag: Uint8Array;
}

/** Pack raw AES-GCM output into the versioned wire bundle without changing bytes. */
export function packDataKeyBundle(parts: DataKeyBundleParts): Uint8Array {
    if (parts.nonce.length !== DATA_KEY_NONCE_BYTES) {
        throw new Error(`AES-GCM nonce must be ${DATA_KEY_NONCE_BYTES} bytes`);
    }
    if (parts.authTag.length !== DATA_KEY_AUTH_TAG_BYTES) {
        throw new Error(`AES-GCM auth tag must be ${DATA_KEY_AUTH_TAG_BYTES} bytes`);
    }

    const bundle = new Uint8Array(DATA_KEY_HEADER_BYTES + parts.ciphertext.length + DATA_KEY_AUTH_TAG_BYTES);
    bundle[0] = DATA_KEY_BUNDLE_VERSION;
    bundle.set(parts.nonce, 1);
    bundle.set(parts.ciphertext, DATA_KEY_HEADER_BYTES);
    bundle.set(parts.authTag, DATA_KEY_HEADER_BYTES + parts.ciphertext.length);
    return bundle;
}

/** Validate and split a versioned AES-GCM bundle before native decryption. */
export function unpackDataKeyBundle(bundle: Uint8Array): DataKeyBundleParts | null {
    if (bundle.length < DATA_KEY_MIN_BUNDLE_BYTES || bundle[0] !== DATA_KEY_BUNDLE_VERSION) {
        return null;
    }

    return {
        nonce: bundle.slice(1, DATA_KEY_HEADER_BYTES),
        ciphertext: bundle.slice(DATA_KEY_HEADER_BYTES, bundle.length - DATA_KEY_AUTH_TAG_BYTES),
        authTag: bundle.slice(bundle.length - DATA_KEY_AUTH_TAG_BYTES),
    };
}

/** Stable domain-separation labels used by the shared key-derivation tree. */
export const CONTENT_KEY_DERIVATION_USAGE = 'AgentHub EnCoder' as const;
export const BLOB_KEY_DERIVATION_USAGE = 'AgentHub Blobs' as const;
export const ANALYTICS_KEY_DERIVATION_USAGE = 'AgentHub' as const;
