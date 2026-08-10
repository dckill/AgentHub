import { decodeUTF8 } from '@/encryption/text';

/** Converts one authenticated Box payload into a value without aborting its batch. */
export function projectBoxPayload(payload: Uint8Array): any | null {
    try {
        return JSON.parse(decodeUTF8(payload));
    } catch {
        return null;
    }
}

export function decryptBoxItem(
    item: Uint8Array,
    decrypt: (item: Uint8Array) => Uint8Array | null,
): any | null {
    try {
        const decrypted = decrypt(item);
        return decrypted ? projectBoxPayload(decrypted) : null;
    } catch {
        return null;
    }
}
