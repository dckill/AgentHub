import { hmacSha512 } from '@artsum/agenthub-wire';

export async function hmac_sha512(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
    return hmacSha512(key, data);
}
