import {
    applySessionDelete,
    type SessionDeleteApplicationActions,
} from './sessionDeleteApplication';

export type DeleteSessionRealtimeHandlerParams = SessionDeleteApplicationActions & {
    sessionId: string;
    log: (message: string) => void;
    applyDelete?: (
        sessionId: string,
        actions: SessionDeleteApplicationActions,
    ) => void;
};

/** Apply one realtime delete-session envelope and own its completion log. */
export function handleDeleteSessionRealtime(
    params: DeleteSessionRealtimeHandlerParams,
): void {
    const applyDelete = params.applyDelete ?? applySessionDelete;
    const { sessionId, log, applyDelete: _injectedApplyDelete, ...actions } = params;

    applyDelete(sessionId, actions);
    log(`🗑️ Session ${sessionId} deleted from local storage`);
}
