export const HTTP_BODY_LIMIT_BYTES = 8 * 1024 * 1024;
export const SOCKET_MESSAGE_LIMIT_BYTES = 8 * 1024 * 1024;

type RateLimitOptions = {
    limit: number;
    windowMs: number;
    maxSubjects: number;
    now?: () => number;
};

type RateWindow = { count: number; startedAt: number };

export class FixedWindowRateLimiter {
    private readonly windows = new Map<string, RateWindow>();
    private readonly now: () => number;

    constructor(private readonly options: RateLimitOptions) {
        this.now = options.now ?? Date.now;
    }

    get size(): number {
        return this.windows.size;
    }

    consume(subject: string): { allowed: boolean; retryAfterMs: number } {
        const now = this.now();
        let window = this.windows.get(subject);
        if (!window || now - window.startedAt >= this.options.windowMs) {
            window = { count: 0, startedAt: now };
            this.windows.delete(subject);
            this.windows.set(subject, window);
        }
        if (window.count >= this.options.limit) {
            return { allowed: false, retryAfterMs: Math.max(1, window.startedAt + this.options.windowMs - now) };
        }
        window.count += 1;
        if (this.windows.size > this.options.maxSubjects) {
            const oldest = this.windows.keys().next().value as string | undefined;
            if (oldest !== undefined) this.windows.delete(oldest);
        }
        return { allowed: true, retryAfterMs: 0 };
    }
}

export class ConcurrencyLimiter {
    private readonly counts = new Map<string, number>();

    constructor(private readonly limit: number) {}

    get size(): number {
        return this.counts.size;
    }

    acquire(subject: string): (() => void) | null {
        const count = this.counts.get(subject) ?? 0;
        if (count >= this.limit) return null;
        this.counts.set(subject, count + 1);
        let released = false;
        return () => {
            if (released) return;
            released = true;
            const current = this.counts.get(subject) ?? 0;
            if (current <= 1) this.counts.delete(subject);
            else this.counts.set(subject, current - 1);
        };
    }

    reset(subject: string): void {
        this.counts.delete(subject);
    }
}
