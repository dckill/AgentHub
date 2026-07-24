import { AsyncLock } from '@/utils/lock';
import type { NormalizedMessage } from './typesRaw';

export class MessageIngestService {
    private queues = new Map<string, NormalizedMessage[]>();
    private processing = new Set<string>();
    private locks = new Map<string, AsyncLock>();

    constructor(private readonly applyMessages: (sessionId: string, messages: NormalizedMessage[]) => void) {}

    enqueue(sessionId: string, messages: NormalizedMessage[]) {
        if (messages.length === 0) {
            return;
        }

        let queue = this.queues.get(sessionId);
        if (!queue) {
            queue = [];
            this.queues.set(sessionId, queue);
        }
        queue.push(...messages);
        this.schedule(sessionId);
    }

    lock(sessionId: string): AsyncLock {
        let lock = this.locks.get(sessionId);
        if (!lock) {
            lock = new AsyncLock();
            this.locks.set(sessionId, lock);
        }
        return lock;
    }

    async flush(sessionId: string) {
        const lock = this.lock(sessionId);
        await lock.inLock(() => {
            this.drain(sessionId);
        });
    }

    clearSession(sessionId: string) {
        this.locks.delete(sessionId);
        this.queues.delete(sessionId);
        this.processing.delete(sessionId);
    }

    clearAll() {
        this.locks.clear();
        this.queues.clear();
        this.processing.clear();
    }

    private schedule(sessionId: string) {
        if (this.processing.has(sessionId)) {
            return;
        }

        this.processing.add(sessionId);
        const lock = this.lock(sessionId);
        void lock.inLock(() => {
            this.drain(sessionId);
        }).finally(() => {
            this.processing.delete(sessionId);
            const pending = this.queues.get(sessionId);
            if (pending && pending.length > 0) {
                this.schedule(sessionId);
            }
        });
    }

    private drain(sessionId: string) {
        while (true) {
            const pending = this.queues.get(sessionId);
            if (!pending || pending.length === 0) {
                break;
            }
            const batch = pending.splice(0, pending.length);
            this.applyMessages(sessionId, batch);
        }
    }
}
