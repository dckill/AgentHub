import type { Session } from './storageTypes';

/** Project the session fields that arrive with a successfully decrypted new message. */
export function buildNewMessageSessionProjection(
    session: Session,
    update: { seq: number; createdAt: number },
    lifecycleThinkingState: boolean | null,
): Session {
    return {
        ...session,
        updatedAt: update.createdAt,
        seq: update.seq,
        ...(lifecycleThinkingState !== null ? {
            thinking: lifecycleThinkingState,
            thinkingAt: Date.now(),
        } : {}),
    };
}
