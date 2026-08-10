import type { ApiMessage } from './apiTypes';
import { decryptRealtimeMessage } from './newMessageDecryptionApplication';
import { buildNewMessageUpdateDecision } from './newMessageUpdateDecision';
import { getLifecycleThinkingStateFromRawContent } from '@/utils/sessionActivity';

/** Combine realtime message decryption with lifecycle and delivery decisions. */
export async function applyNewMessageRealtimeUpdate(params: {
    message: ApiMessage;
    currentLastSeq: number | undefined;
    decrypt: Parameters<typeof decryptRealtimeMessage>[0]['decrypt'];
    assertCurrent: () => void;
}) {
    const decryptionResult = await decryptRealtimeMessage({
        message: params.message,
        decrypt: params.decrypt,
        assertCurrent: params.assertCurrent,
    });

    if (decryptionResult.kind !== 'applied') {
        return decryptionResult;
    }

    return {
        ...decryptionResult,
        lifecycleThinkingState: getLifecycleThinkingStateFromRawContent(decryptionResult.decrypted.content),
        decision: buildNewMessageUpdateDecision({
            hasDecryptedMessage: true,
            hasNormalizedMessage: Boolean(decryptionResult.normalized),
            currentLastSeq: params.currentLastSeq,
            incomingSeq: params.message.seq,
        }),
    };
}
