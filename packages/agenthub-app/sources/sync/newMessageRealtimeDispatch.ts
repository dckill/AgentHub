import type { ApiUpdateContainer } from './apiTypes';
import {
    handleNewMessageRealtimeUpdate,
    type NewMessageRealtimeHandlerParams,
} from './newMessageRealtimeHandler';

type NewMessageUpdate = Extract<ApiUpdateContainer['body'], { t: 'new-message' }>;

export type NewMessageRealtimeDispatchContext = {
    getSession: (sessionId: string) => NewMessageRealtimeHandlerParams['session'];
    getSessionEncryption: (
        sessionId: string,
    ) => NewMessageRealtimeHandlerParams['encryption'];
    getCurrentLastSeq: (sessionId: string) => NewMessageRealtimeHandlerParams['currentLastSeq'];
    refreshMissingSession: NewMessageRealtimeHandlerParams['refreshMissingSession'];
    invalidateMessages: NewMessageRealtimeHandlerParams['invalidateMessages'];
    applySession: NewMessageRealtimeHandlerParams['applySession'];
    enqueueMessage: NewMessageRealtimeHandlerParams['enqueueMessage'];
    setLastSeq: NewMessageRealtimeHandlerParams['setLastSeq'];
    isMutableToolCall: NewMessageRealtimeHandlerParams['isMutableToolCall'];
    invalidateGitStatus: NewMessageRealtimeHandlerParams['invalidateGitStatus'];
    assertCurrent: NewMessageRealtimeHandlerParams['assertCurrent'];
    onDecryptError: NewMessageRealtimeHandlerParams['onDecryptError'];
    onEmptyDecryption: NewMessageRealtimeHandlerParams['onEmptyDecryption'];
    onUnreadMessage: NewMessageRealtimeHandlerParams['onUnreadMessage'];
    handleNewMessage?: typeof handleNewMessageRealtimeUpdate;
};

/** Route new-message envelopes while keeping crypto and delivery effects in the handler. */
export async function dispatchNewMessageRealtimeUpdate(
    envelope: ApiUpdateContainer,
    params: NewMessageRealtimeDispatchContext,
): Promise<boolean> {
    if (envelope.body.t !== 'new-message') {
        return false;
    }

    const update = envelope.body as NewMessageUpdate;
    const handler = params.handleNewMessage ?? handleNewMessageRealtimeUpdate;
    await handler({
        update,
        seq: envelope.seq,
        createdAt: envelope.createdAt,
        session: params.getSession(update.sid),
        encryption: params.getSessionEncryption(update.sid),
        currentLastSeq: params.getCurrentLastSeq(update.sid),
        refreshMissingSession: params.refreshMissingSession,
        invalidateMessages: params.invalidateMessages,
        applySession: params.applySession,
        enqueueMessage: params.enqueueMessage,
        setLastSeq: params.setLastSeq,
        isMutableToolCall: params.isMutableToolCall,
        invalidateGitStatus: params.invalidateGitStatus,
        assertCurrent: params.assertCurrent,
        onDecryptError: params.onDecryptError,
        onEmptyDecryption: params.onEmptyDecryption,
        onUnreadMessage: params.onUnreadMessage,
    });
    return true;
}
