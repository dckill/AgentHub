import { getRandomBytes } from 'expo-crypto';
import sodium from '@/encryption/libsodium.lib';
import { encodeBase64 } from '../encryption/base64';
import { publicHttpClient } from '@/sync/publicHttpClient';

export interface QRAuthKeyPair {
    publicKey: Uint8Array;
    secretKey: Uint8Array;
    pollingSecret: Uint8Array;
}

export function generateAuthKeyPair(): QRAuthKeyPair {
    const secret = getRandomBytes(32);
    const keypair = sodium.crypto_box_seed_keypair(secret);
    return {
        publicKey: keypair.publicKey,
        secretKey: keypair.privateKey,
        pollingSecret: getRandomBytes(32),
    };
}

export async function prepareAuthKeyPair(): Promise<QRAuthKeyPair> {
    await sodium.ready;
    return generateAuthKeyPair();
}

export async function authQRStart(keypair: QRAuthKeyPair, signal?: AbortSignal): Promise<boolean> {
    try {
        await publicHttpClient.request('/v1/auth/account/request', {
            method: 'POST',
            signal,
            body: { publicKey: encodeBase64(keypair.publicKey), pollingSecret: encodeBase64(keypair.pollingSecret) },
            idempotent: true,
        });

        return true;
    } catch {
        return false;
    }
}
