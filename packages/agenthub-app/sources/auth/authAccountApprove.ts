import { encodeBase64 } from "../encryption/base64";
import { publicHttpClient } from '@/sync/publicHttpClient';

export async function authAccountApprove(token: string, publicKey: Uint8Array, answer: Uint8Array, signal?: AbortSignal) {
    await publicHttpClient.request('/v1/auth/account/response', {
        method: 'POST',
        signal,
        body: { publicKey: encodeBase64(publicKey), response: encodeBase64(answer) },
        headers: {
            'Authorization': `Bearer ${token}`,
        },
    });
}
