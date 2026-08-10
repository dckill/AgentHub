import { getMessageDeliveryPlan, type MessageDeliveryPlan } from './messageDeliveryPlan';

export type NewMessageUpdateAction = MessageDeliveryPlan | 'ignore';

export interface NewMessageUpdateDecisionInput {
    hasDecryptedMessage: boolean;
    hasNormalizedMessage: boolean;
    currentLastSeq: number | undefined;
    incomingSeq: number;
}

export interface NewMessageUpdateDecision {
    action: NewMessageUpdateAction;
}

/**
 * Decides whether a realtime new-message update is ignored, enqueued, or
 * reconciled from the server. Decryption and normalization failures have
 * intentionally different outcomes: a failed decrypt is left for a later
 * sync, while an unusable decrypted payload requires a refresh.
 */
export function buildNewMessageUpdateDecision(
    input: NewMessageUpdateDecisionInput,
): NewMessageUpdateDecision {
    if (!input.hasDecryptedMessage) {
        return { action: 'ignore' };
    }

    if (!input.hasNormalizedMessage) {
        return { action: 'refresh' };
    }

    return {
        action: getMessageDeliveryPlan(input.currentLastSeq, input.incomingSeq),
    };
}
