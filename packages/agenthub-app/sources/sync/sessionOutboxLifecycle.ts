import type { AccountRequest } from './accountLifecycle';
import {
    flushOutboxBatch,
    type OutboxFlushResponse,
    type OutboxMessage,
} from './outboxFlush';
import { runOutboxSendLifecycle } from './outboxSendLifecycle';

export interface SessionOutboxLifecycleOptions {
    generation: number;
    pending?: OutboxMessage[];
    hasPending: () => boolean;
    startSend: () => AbortController;
    finishSend: (controller: AbortController) => void;
    runRequest: <T>(
        generation: number,
        operation: (request: AccountRequest) => Promise<T>,
    ) => Promise<T>;
    postMessages: (batch: OutboxMessage[], signal: AbortSignal) => Promise<OutboxFlushResponse>;
    assertCurrent: () => void;
    currentLastSeq: () => number;
    setLastSeq: (seq: number) => void;
    deletePending: () => void;
    onIdle: () => Promise<void>;
    isCurrent: () => boolean;
    onCurrentError: () => void;
    isBackground: () => boolean;
    onBackgroundPending: () => void;
}

/** Bind one session's outbox flush to account generation and send lifecycle. */
export async function runSessionOutboxLifecycle(
    options: SessionOutboxLifecycleOptions,
): Promise<void> {
    await runOutboxSendLifecycle({
        pending: options.pending,
        hasPending: options.hasPending,
        startSend: options.startSend,
        finishSend: options.finishSend,
        flushBatch: (pending, batch, controller) => flushOutboxBatch({
            pending,
            batch,
            controller,
            runRequest: (operation) => options.runRequest(
                options.generation,
                (request) => operation(request.signal),
            ),
            postMessages: options.postMessages,
            assertCurrent: options.assertCurrent,
            currentLastSeq: options.currentLastSeq,
            setLastSeq: options.setLastSeq,
        }),
        deletePending: options.deletePending,
        onIdle: options.onIdle,
        isCurrent: options.isCurrent,
        onCurrentError: options.onCurrentError,
        isBackground: options.isBackground,
        onBackgroundPending: options.onBackgroundPending,
    });
}
