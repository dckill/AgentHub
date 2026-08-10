import type { ApiUpdate, ApiUpdateContainer } from './apiTypes';
import type { Session } from './storageTypes';
import {
    handleNewSessionRealtimeUpdate,
    type NewSessionRealtimeHandlerParams,
} from './newSessionRealtimeHandler';
import {
    handleDeleteSessionRealtime,
    type DeleteSessionRealtimeHandlerParams,
} from './deleteSessionRealtimeHandler';
import {
    handleUpdateSessionRealtime,
    type UpdateSessionRealtimeHandlerParams,
} from './updateSessionRealtimeHandler';

type NewSessionUpdate = Extract<ApiUpdate, { t: 'new-session' }>;
type DeleteSessionUpdate = Extract<ApiUpdate, { t: 'delete-session' }>;
type UpdateSessionUpdate = Extract<ApiUpdate, { t: 'update-session' }>;

export type SessionRealtimeDispatchContext = {
    getSession: (sessionId: string) => Session | undefined;
    ensureSessionLoaded: (sessionId: string) => Promise<unknown>;
    getSessionEncryption: (
        sessionId: string,
    ) => UpdateSessionRealtimeHandlerParams['encryption'];
    assertCurrent: NewSessionRealtimeHandlerParams['assertCurrent'];
    refreshMissingSession: UpdateSessionRealtimeHandlerParams['refreshMissingSession'];
    invalidateSessions: UpdateSessionRealtimeHandlerParams['invalidateSessions'];
    applySession: UpdateSessionRealtimeHandlerParams['applySession'];
    invalidateGitStatus: UpdateSessionRealtimeHandlerParams['invalidateGitStatus'];
    refreshMessages: UpdateSessionRealtimeHandlerParams['refreshMessages'];
    deleteSession: DeleteSessionRealtimeHandlerParams['deleteSession'];
    removeSessionEncryption: DeleteSessionRealtimeHandlerParams['removeSessionEncryption'];
    removeProjectSession: DeleteSessionRealtimeHandlerParams['removeProjectSession'];
    cleanupResources: DeleteSessionRealtimeHandlerParams['cleanupResources'];
    log: DeleteSessionRealtimeHandlerParams['log'];
    logError: UpdateSessionRealtimeHandlerParams['logError'];
    handleNewSession?: typeof handleNewSessionRealtimeUpdate;
    handleDeleteSession?: typeof handleDeleteSessionRealtime;
    handleUpdateSession?: typeof handleUpdateSessionRealtime;
};

/** Route session envelopes while keeping loading, projection, and cleanup in handlers. */
export async function dispatchSessionRealtimeUpdate(
    envelope: ApiUpdateContainer,
    params: SessionRealtimeDispatchContext,
): Promise<boolean> {
    const body = envelope.body;

    if (body.t === 'new-session') {
        const update = body as NewSessionUpdate;
        params.log('🆕 New session update received');
        const handler = params.handleNewSession ?? handleNewSessionRealtimeUpdate;
        await handler({
            ensureSessionLoaded: () => params.ensureSessionLoaded(update.id),
            assertCurrent: params.assertCurrent,
            onError: (error) => {
                console.error(`Failed to load realtime session ${update.id}:`, error);
                params.invalidateSessions();
            },
        });
        return true;
    }

    if (body.t === 'delete-session') {
        const update = body as DeleteSessionUpdate;
        params.log('🗑️ Delete session update received');
        const handler = params.handleDeleteSession ?? handleDeleteSessionRealtime;
        handler({
            sessionId: update.sid,
            deleteSession: params.deleteSession,
            removeSessionEncryption: params.removeSessionEncryption,
            removeProjectSession: params.removeProjectSession,
            cleanupResources: params.cleanupResources,
            log: params.log,
        });
        return true;
    }

    if (body.t === 'update-session') {
        const update = body as UpdateSessionUpdate;
        const session = params.getSession(update.id);
        const handler = params.handleUpdateSession ?? handleUpdateSessionRealtime;
        await handler({
            session,
            encryption: session ? params.getSessionEncryption(update.id) : null,
            update,
            seq: envelope.seq,
            createdAt: envelope.createdAt,
            assertCurrent: params.assertCurrent,
            refreshMissingSession: params.refreshMissingSession,
            invalidateSessions: params.invalidateSessions,
            applySession: params.applySession,
            invalidateGitStatus: params.invalidateGitStatus,
            refreshMessages: params.refreshMessages,
            log: params.log,
            logError: params.logError,
        });
        return true;
    }

    return false;
}
