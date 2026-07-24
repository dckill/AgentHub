export type OutboxMessage = {
    localId: string;
    content: string;
};

export class OutboxService {
    private pending = new Map<string, OutboxMessage[]>();
    private abortControllers = new Map<string, AbortController>();

    enqueue(sessionId: string, message: OutboxMessage) {
        let queue = this.pending.get(sessionId);
        if (!queue) {
            queue = [];
            this.pending.set(sessionId, queue);
        }
        queue.push(message);
    }

    getPending(sessionId: string): OutboxMessage[] | undefined {
        return this.pending.get(sessionId);
    }

    deletePending(sessionId: string) {
        this.pending.delete(sessionId);
    }

    hasPending(): boolean {
        if (this.abortControllers.size > 0) {
            return true;
        }
        for (const messages of this.pending.values()) {
            if (messages.length > 0) {
                return true;
            }
        }
        return false;
    }

    startSend(sessionId: string): AbortController {
        const controller = new AbortController();
        this.abortControllers.set(sessionId, controller);
        return controller;
    }

    finishSend(sessionId: string, controller: AbortController) {
        if (this.abortControllers.get(sessionId) === controller) {
            this.abortControllers.delete(sessionId);
        }
    }

    failAll(): string[] {
        for (const controller of this.abortControllers.values()) {
            controller.abort();
        }
        this.abortControllers.clear();

        const sessionIds: string[] = [];
        for (const [sessionId, pending] of this.pending) {
            if (pending.length === 0) {
                continue;
            }
            pending.length = 0;
            this.pending.delete(sessionId);
            sessionIds.push(sessionId);
        }
        return sessionIds;
    }

    clearSession(sessionId: string) {
        this.abortControllers.delete(sessionId);
        this.pending.delete(sessionId);
    }
}
