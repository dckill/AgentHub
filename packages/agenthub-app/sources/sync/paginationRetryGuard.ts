type PaginationRetryGuardOptions = {
    baseDelayMs?: number;
    maxDelayMs?: number;
};

type PaginationRetryState = {
    failures: number;
    retryAfter: number;
};

export class PaginationRetryGuard {
    private readonly baseDelayMs: number;
    private readonly maxDelayMs: number;
    private readonly states = new Map<string, PaginationRetryState>();

    constructor(options: PaginationRetryGuardOptions = {}) {
        this.baseDelayMs = options.baseDelayMs ?? 1_000;
        this.maxDelayMs = options.maxDelayMs ?? 30_000;
    }

    canStart(sessionId: string, options: { online: boolean; now?: number }): boolean {
        if (!options.online) {
            return false;
        }
        const state = this.states.get(sessionId);
        return !state || (options.now ?? Date.now()) >= state.retryAfter;
    }

    recordFailure(sessionId: string, now = Date.now()): void {
        const failures = (this.states.get(sessionId)?.failures ?? 0) + 1;
        const delay = Math.min(this.maxDelayMs, this.baseDelayMs * (2 ** Math.min(failures - 1, 30)));
        this.states.set(sessionId, { failures, retryAfter: now + delay });
    }

    recordSuccess(sessionId: string): void {
        this.states.delete(sessionId);
    }

    clear(sessionId: string): void {
        this.states.delete(sessionId);
    }

    clearAll(): void {
        this.states.clear();
    }
}
