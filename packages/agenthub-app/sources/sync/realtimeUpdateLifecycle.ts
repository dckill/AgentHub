import type { ApiUpdateContainer } from './apiTypes';
import { parseApiUpdate } from './updateParser';
import {
    dispatchRealtimeUpdate,
    type RealtimeUpdateDispatchParams,
} from './realtimeUpdateDispatch';

type MessageDispatchContext = RealtimeUpdateDispatchParams['message'];

export type RealtimeUpdateLifecycleOptions = {
    update: unknown;
    generation: number;
    assertCurrent: () => void;
    message: Omit<MessageDispatchContext, 'invalidateMessages' | 'enqueueMessage' | 'setLastSeq' | 'isMutableToolCall'> & {
        invalidateMessages: (sessionId: string) => void;
        enqueueMessage: (sessionId: string, message: Parameters<MessageDispatchContext['enqueueMessage']>[0]) => void;
        setLastSeq: (sessionId: string, seq: number) => void;
        isMutableToolCall: (sessionId: string, toolUseId: string) => boolean;
    };
    session: RealtimeUpdateDispatchParams['session'];
    account: RealtimeUpdateDispatchParams['account'];
    machine: RealtimeUpdateDispatchParams['machine'];
    artifact: RealtimeUpdateDispatchParams['artifact'];
    warnInvalid: (message: string) => void;
    errorInvalid: (message: string, detail: unknown) => void;
    parse?: (update: unknown) => ApiUpdateContainer | null;
    dispatch?: typeof dispatchRealtimeUpdate;
};

/** Parse and dispatch one Socket.IO update with the account generation gate applied first. */
export async function runRealtimeUpdateLifecycle(
    options: RealtimeUpdateLifecycleOptions,
): Promise<void> {
    options.assertCurrent();
    const updateData = (options.parse ?? parseApiUpdate)(options.update);
    if (!updateData) {
        options.warnInvalid('❌ Sync: Invalid update received');
        options.errorInvalid('❌ Sync: Invalid update data:', options.update);
        return;
    }

    const messageSessionId = updateData.body.t === 'new-message'
        ? updateData.body.sid
        : undefined;
    const dispatch = options.dispatch ?? dispatchRealtimeUpdate;
    await dispatch({
        envelope: updateData,
        message: {
            ...options.message,
            invalidateMessages: () => {
                if (messageSessionId) options.message.invalidateMessages(messageSessionId);
            },
            enqueueMessage: (message) => {
                if (messageSessionId) options.message.enqueueMessage(messageSessionId, message);
            },
            setLastSeq: (seq) => {
                if (messageSessionId) options.message.setLastSeq(messageSessionId, seq);
            },
            isMutableToolCall: (toolUseId) => messageSessionId
                ? options.message.isMutableToolCall(messageSessionId, toolUseId)
                : false,
        },
        session: options.session,
        account: options.account,
        machine: options.machine,
        artifact: options.artifact,
    });
}
