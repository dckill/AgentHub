import type { NormalizedMessage } from './typesRaw';

export type PendingOutboxFailureApplicationParams = {
    failAll: () => string[];
    enqueueMessages: (sessionId: string, messages: NormalizedMessage[]) => void;
    now: number;
    reasonText: string;
    createMessageId: () => string;
};

/** Convert failed outbox entries into one visible event per affected session. */
export function applyPendingOutboxFailure(params: PendingOutboxFailureApplicationParams): void {
    const sessionIds = params.failAll();
    for (const sessionId of sessionIds) {
        params.enqueueMessages(sessionId, [{
            id: params.createMessageId(),
            localId: null,
            createdAt: params.now,
            role: 'event',
            isSidechain: false,
            content: {
                type: 'message',
                message: params.reasonText,
            },
        }]);
    }
}
