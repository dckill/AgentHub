
import { encodeBase64 } from "../encryption/base64";
import { publicHttpClient } from '@/sync/publicHttpClient';

interface AuthRequestStatus {
    status: 'not_found' | 'pending' | 'authorized';
    supportsV2: boolean;
}

export async function authApprove(token: string, publicKey: Uint8Array, answerV1: Uint8Array, answerV2: Uint8Array, signal?: AbortSignal) {
    const publicKeyBase64 = encodeBase64(publicKey);
    
    // First, check the auth request status
    const statusResponse = await publicHttpClient.request<AuthRequestStatus>(
        `/v1/auth/request/status?publicKey=${encodeURIComponent(publicKeyBase64)}`,
        { signal, headers: { 'Authorization': `Bearer ${token}` } },
    );
    
    const { status, supportsV2 } = statusResponse.data;
    
    // Handle different status cases
    if (status === 'not_found') {
        // Already authorized, no need to approve again
        return;
    }
    
    if (status === 'authorized') {
        // Already authorized, no need to approve again
        return;
    }
    
    // Handle pending status
    if (status === 'pending') {
        await publicHttpClient.request('/v1/auth/response', {
            method: 'POST',
            signal,
            body: {
                publicKey: publicKeyBase64,
                response: supportsV2 ? encodeBase64(answerV2) : encodeBase64(answerV1),
            },
            headers: {
                'Authorization': `Bearer ${token}`,
            },
        });
    }
}
