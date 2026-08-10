import type { OutboxMessage } from './outboxService';

export type { OutboxMessage };

export type OutboxFlushResponse = {
    messages: Array<{ seq: number }>;
};

export type OutboxFlushParams = {
    pending: OutboxMessage[];
    batch: OutboxMessage[];
    controller: AbortController;
    runRequest: (operation: (signal: AbortSignal) => Promise<OutboxFlushResponse>) => Promise<OutboxFlushResponse>;
    postMessages: (batch: OutboxMessage[], signal: AbortSignal) => Promise<OutboxFlushResponse>;
    assertCurrent: () => void;
    currentLastSeq: () => number;
    setLastSeq: (seq: number) => void;
};

/** Flush one immutable outbox batch and project the server's highest sequence. */
export async function flushOutboxBatch(params: OutboxFlushParams): Promise<void> {
    const abortSend = () => params.controller.abort();
    const data = await params.runRequest(async (requestSignal) => {
        requestSignal.addEventListener('abort', abortSend, { once: true });
        try {
            return await params.postMessages(params.batch, params.controller.signal);
        } finally {
            requestSignal.removeEventListener('abort', abortSend);
        }
    });

    params.assertCurrent();
    params.pending.splice(0, params.batch.length);

    if (data.messages.length > 0) {
        let maxSeq = params.currentLastSeq();
        for (const message of data.messages) {
            if (message.seq > maxSeq) {
                maxSeq = message.seq;
            }
        }
        params.setLastSeq(maxSeq);
    }
}
