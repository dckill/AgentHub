import type { ApiUpdate } from './apiTypes';
import { applySessionEncryptedUpdate } from './sessionEncryptedUpdate';
import { buildSessionEnvelopeProjection } from './sessionEnvelopeProjection';
import { buildSessionUpdateEffects, type SessionUpdateEffects } from './sessionUpdateEffects';
import type { Session } from './storageTypes';

type SessionUpdate = Extract<ApiUpdate, { t: 'update-session' }>;
type SessionEncryptionLike = Parameters<typeof applySessionEncryptedUpdate>[0]['encryption'];

export type SessionUpdateApplicationResult =
    | { kind: 'missing-session'; sessionId: string }
    | { kind: 'missing-encryption'; sessionId: string }
    | { kind: 'applied'; session: Session; effects: SessionUpdateEffects };

/** Apply an update-session envelope, encrypted fields, and control effects together. */
export async function applySessionUpdate(params: {
    session: Session | undefined;
    encryption: SessionEncryptionLike | null;
    update: SessionUpdate;
    seq: number;
    createdAt: number;
    assertCurrent: () => void;
    onError?: (field: 'metadata' | 'agentState', error: unknown) => void;
}): Promise<SessionUpdateApplicationResult> {
    if (!params.session) {
        return { kind: 'missing-session', sessionId: params.update.id };
    }
    if (!params.encryption) {
        return { kind: 'missing-encryption', sessionId: params.update.id };
    }

    const updated = await applySessionEncryptedUpdate({
        session: params.session,
        update: params.update,
        encryption: params.encryption,
        assertCurrent: params.assertCurrent,
        onError: params.onError,
    });
    return {
        kind: 'applied',
        session: buildSessionEnvelopeProjection(updated, params.seq, params.createdAt),
        effects: buildSessionUpdateEffects({
            hasAgentStateUpdate: Boolean(params.update.agentState),
            previousControlledByUser: params.session.agentState?.controlledByUser,
            nextControlledByUser: updated.agentState?.controlledByUser,
        }),
    };
}
