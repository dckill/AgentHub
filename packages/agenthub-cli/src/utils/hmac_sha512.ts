import { hmacSha512 } from '@artsum/agenthub-wire';

/**
 * Compute HMAC-SHA512 for given key and data
 * @param key - The key for HMAC
 * @param data - The data to compute HMAC for
 * @returns HMAC-SHA512 result as Uint8Array
 */
export function hmac_sha512_sync(key: Uint8Array, data: Uint8Array): Uint8Array {
    return hmacSha512(key, data);
}

export async function hmac_sha512(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    return hmac_sha512_sync(key, data);
}
