import { randomUUID } from 'expo-crypto';
import type { AuthCredentials } from '@/auth/tokenStorage';
import { buildExternalShareLink, createEncryptedSelectedTextShare, prepareExternalShareCrypto } from '@/utils/externalShareCapability';
import { createExternalShare, type ExternalShareMetadata } from './externalSharesApi';

export async function publishSelectedTextShare(options: {
    credentials: AuthCredentials;
    text: string;
    expiresInSeconds: 3_600 | 86_400 | 604_800;
    origin: string;
    id?: string;
    signal?: AbortSignal;
}): Promise<{ link: string; metadata: ExternalShareMetadata }> {
    const id = options.id ?? randomUUID();
    await prepareExternalShareCrypto();
    const encrypted = createEncryptedSelectedTextShare(options.text);
    const metadata = await createExternalShare(options.credentials, {
        id,
        ciphertext: encrypted.ciphertext,
        expiresInSeconds: options.expiresInSeconds,
    }, options.signal);
    return {
        metadata,
        link: buildExternalShareLink(options.origin, metadata.id, encrypted.key),
    };
}
