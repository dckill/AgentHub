import type { Session } from './storageTypes';
import { handleMissingSessionForUpdate } from './sessionUpdateGuards';
import { applySessionUpdate } from './sessionUpdateApplication';

type SessionUpdateParams = Parameters<typeof applySessionUpdate>[0];
type SessionUpdateResult = Awaited<ReturnType<typeof applySessionUpdate>>;

export type UpdateSessionRealtimeHandlerParams = Omit<SessionUpdateParams, 'onError'> & {
    refreshMissingSession: (sessionId: string) => void;
    invalidateSessions: () => void;
    applySession: (session: Session) => void;
    invalidateGitStatus: (sessionId: string) => void;
    refreshMessages: (sessionId: string) => void;
    log: (message: string) => void;
    logError: (message: string, error?: unknown) => void;
    applyUpdate?: (params: SessionUpdateParams) => Promise<SessionUpdateResult>;
};

/** Apply one realtime update-session envelope and own recovery/control side effects. */
export async function handleUpdateSessionRealtime(
    params: UpdateSessionRealtimeHandlerParams,
): Promise<void> {
    const sessionId = params.update.id;
    const applyUpdate = params.applyUpdate ?? applySessionUpdate;
    const sessionUpdateResult = await applyUpdate({
        session: params.session,
        encryption: params.encryption,
        update: params.update,
        seq: params.seq,
        createdAt: params.createdAt,
        assertCurrent: params.assertCurrent,
        onError: (field, error) => {
            params.assertCurrent();
            params.logError(`Failed to decrypt session ${field} for ${sessionId}:`, error);
            params.invalidateSessions();
        },
    });
    // The decryptor performs field-level checks, but the account can still
    // switch after the promise resolves and before this handler projects the
    // result. Keep the outer commit fail-closed for that final await gap.
    params.assertCurrent();

    if (sessionUpdateResult.kind !== 'applied') {
        handleMissingSessionForUpdate({
            sessionId,
            updateType: 'update-session',
            hasSession: Boolean(params.session),
            hasEncryption: Boolean(params.encryption),
            fetchSessions: () => params.refreshMissingSession(sessionId),
        });
        return;
    }

    params.applySession(sessionUpdateResult.session);
    if (sessionUpdateResult.effects.invalidateGitStatus) {
        params.invalidateGitStatus(sessionId);
        if (sessionUpdateResult.effects.refreshMessages) {
            params.log(`🔄 Control returned to mobile for session ${sessionId}, re-fetching messages`);
            params.refreshMessages(sessionId);
        }
    }
}
