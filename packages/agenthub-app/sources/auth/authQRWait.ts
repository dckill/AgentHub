import { decodeBase64, encodeBase64 } from '../encryption/base64';
import { QRAuthKeyPair } from './authQRStart';
import { decryptBox } from '@/encryption/libsodium';
import { publicHttpClient } from '@/sync/publicHttpClient';

export interface AuthCredentials {
    secret: Uint8Array;
    token: string;
}

export async function authQRWait(keypair: QRAuthKeyPair, onProgress?: (dots: number) => void, shouldCancel?: () => boolean, signal?: AbortSignal): Promise<AuthCredentials | null> {
    let dots = 0;

    while (true) {
        if (signal?.aborted || (shouldCancel && shouldCancel())) {
            return null;
        }

        try {
            const response = await publicHttpClient.request<{ state: string; token: string; response: string }>('/v1/auth/account/request', {
                method: 'POST',
                signal,
                body: { publicKey: encodeBase64(keypair.publicKey), pollingSecret: encodeBase64(keypair.pollingSecret) },
                idempotent: true,
            });

            if (response.data.state === 'authorized') {
                const token = response.data.token as string;
                const encryptedResponse = decodeBase64(response.data.response);
                
                const decrypted = decryptBox(encryptedResponse, keypair.secretKey);
                if (decrypted) {
                    return {
                        secret: decrypted,
                        token: token
                    };
                } else {
                    return null;
                }
            }
        } catch {
            return null;
        }

        // Call progress callback if provided
        if (onProgress) {
            onProgress(dots);
        }
        dots++;

        // Wait 1 second before next check
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
}
