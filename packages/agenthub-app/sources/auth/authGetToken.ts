import { authChallenge } from "./authChallenge";
import { encodeBase64 } from "../encryption/base64";
import { publicHttpClient } from '@/sync/publicHttpClient';
import sodium from '@/encryption/libsodium.lib';

export async function authGetToken(secret: Uint8Array, signal?: AbortSignal) {
    await sodium.ready;
    const { challenge, signature, publicKey } = authChallenge(secret);
    const response = await publicHttpClient.request<{ token: string }>('/v1/auth', {
        method: 'POST',
        signal,
        body: { challenge: encodeBase64(challenge), signature: encodeBase64(signature), publicKey: encodeBase64(publicKey) },
    });
    return response.data.token;
}
