import type { ApiMessage } from './apiTypes';
import type { DecryptedMessage } from './storageTypes';
import { normalizeRawMessage, type NormalizedMessage } from './typesRaw';

export type RealtimeMessageDecryptionResult =
    | { kind: 'failed'; error: unknown }
    | { kind: 'empty' }
    | { kind: 'applied'; decrypted: DecryptedMessage; normalized: NormalizedMessage | null };

/** Decrypt and normalize one realtime message without deciding storage side effects. */
export async function decryptRealtimeMessage(params: {
    message: ApiMessage;
    decrypt: (message: ApiMessage) => Promise<DecryptedMessage | null>;
    assertCurrent: () => void;
}): Promise<RealtimeMessageDecryptionResult> {
    let decrypted: DecryptedMessage | null;
    try {
        decrypted = await params.decrypt(params.message);
    } catch (error) {
        params.assertCurrent();
        return { kind: 'failed', error };
    }

    params.assertCurrent();
    if (!decrypted) {
        return { kind: 'empty' };
    }

    return {
        kind: 'applied',
        decrypted,
        normalized: normalizeRawMessage(
            decrypted.id,
            decrypted.localId,
            decrypted.createdAt,
            decrypted.content,
        ),
    };
}
