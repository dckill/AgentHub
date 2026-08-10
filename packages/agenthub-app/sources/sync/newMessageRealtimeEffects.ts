import type { NormalizedMessage } from './typesRaw';
import type { Session } from './storageTypes';
import { buildNewMessageSessionProjection } from './newMessageUpdateProjection';
import type { NewMessageUpdateDecision } from './newMessageUpdateDecision';

export type NewMessageRealtimeDelivery = 'enqueue' | 'refresh' | 'ignore';

export type NewMessageRealtimeEffects = {
    session: Session | null;
    delivery: NewMessageRealtimeDelivery;
    message: NormalizedMessage | null;
};

/** Plan stateful effects after a realtime message has been decrypted. */
export function planNewMessageRealtimeEffects(params: {
    session: Session | undefined;
    update: { seq: number; createdAt: number };
    lifecycleThinkingState: boolean | null;
    decision: NewMessageUpdateDecision;
    message: NormalizedMessage | null;
}): NewMessageRealtimeEffects {
    const session = params.session
        ? buildNewMessageSessionProjection(
            params.session,
            params.update,
            params.lifecycleThinkingState,
        )
        : null;

    if (params.decision.action === 'enqueue' && params.message) {
        return { session, delivery: 'enqueue', message: params.message };
    }

    if (params.decision.action === 'refresh' || params.decision.action === 'enqueue') {
        return { session, delivery: 'refresh', message: params.message };
    }

    return { session, delivery: 'ignore', message: params.message };
}
