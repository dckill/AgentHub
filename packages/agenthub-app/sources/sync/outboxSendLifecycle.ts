import type { OutboxMessage } from './outboxService';

export type { OutboxMessage };

export async function runOutboxSendLifecycle({
    pending,
    hasPending,
    startSend,
    finishSend,
    flushBatch,
    deletePending,
    onIdle,
    isCurrent,
    onCurrentError,
    isBackground,
    onBackgroundPending,
}: {
    pending?: OutboxMessage[];
    hasPending: () => boolean;
    startSend: () => AbortController;
    finishSend: (controller: AbortController) => void;
    flushBatch: (
        pending: OutboxMessage[],
        batch: OutboxMessage[],
        controller: AbortController,
    ) => Promise<void>;
    deletePending: () => void;
    onIdle: () => Promise<void>;
    isCurrent: () => boolean;
    onCurrentError: () => void;
    isBackground: () => boolean;
    onBackgroundPending: () => void;
}): Promise<void> {
    if (!pending || pending.length === 0) {
        if (isCurrent() && !hasPending()) {
            await onIdle();
        }
        return;
    }

    const batch = pending.slice();
    const controller = startSend();
    try {
        await flushBatch(pending, batch, controller);
    } catch (error) {
        if (isCurrent()) {
            onCurrentError();
        }
        throw error;
    } finally {
        finishSend(controller);
    }

    // The request may have completed just before an account switch. Do not
    // delete or re-schedule state that may now belong to the replacement
    // account (the session id can be reused across accounts).
    if (!isCurrent()) {
        return;
    }

    if (pending.length === 0) {
        deletePending();
    }
    if (!hasPending()) {
        await onIdle();
    } else if (isBackground()) {
        onBackgroundPending();
    }
}
