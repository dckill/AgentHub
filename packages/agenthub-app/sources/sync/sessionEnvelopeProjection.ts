import type { Session } from './storageTypes';

/** Attach the server update envelope while preserving decrypted and local session state. */
export function buildSessionEnvelopeProjection(
    session: Session,
    seq: number,
    updatedAt: number,
): Session {
    return {
        ...session,
        seq,
        updatedAt,
    };
}
