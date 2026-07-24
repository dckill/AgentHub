export async function delay(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

export function exponentialBackoffDelay(currentFailureCount: number, minDelay: number, maxDelay: number, maxFailureCount: number) {
    const cappedFailureCount = Math.min(Math.max(currentFailureCount, 1), maxFailureCount);
    const delayCap = Math.min(maxDelay, minDelay * (2 ** (cappedFailureCount - 1)));
    return Math.round(Math.random() * delayCap);
}

export type BackoffFunc = <T>(callback: () => Promise<T>) => Promise<T>;

export class HttpStatusError extends Error {
    constructor(public readonly status: number, message: string) {
        super(message);
        this.name = 'HttpStatusError';
    }
}

export function isRetryableError(error: unknown): boolean {
    if (isAbortError(error)) return false;
    if (error instanceof Error && error.name === 'TimeoutError') return false;
    if (error instanceof HttpStatusError) {
        return error.status === 408 || error.status === 425 || error.status === 429 || error.status >= 500;
    }
    return true;
}

export function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

export function createBackoff(
    opts?: {
        onError?: (e: any, failuresCount: number) => void,
        minDelay?: number,
        maxDelay?: number,
        maxFailureCount?: number,
        maxAttempts?: number,
        shouldRetry?: (error: unknown, failuresCount: number) => boolean,
    }): BackoffFunc {
    return async <T>(callback: () => Promise<T>): Promise<T> => {
        let currentFailureCount = 0;
        const minDelay = opts && opts.minDelay !== undefined ? opts.minDelay : 250;
        const maxDelay = opts && opts.maxDelay !== undefined ? opts.maxDelay : 1000;
        const maxFailureCount = opts && opts.maxFailureCount !== undefined ? opts.maxFailureCount : 50;
        const maxAttempts = opts?.maxAttempts ?? 6;
        while (currentFailureCount < maxAttempts) {
            try {
                return await callback();
            } catch (e) {
                if (isAbortError(e)) {
                    throw e;
                }
                currentFailureCount++;
                if (opts && opts.onError) {
                    opts.onError(e, currentFailureCount);
                }
                const shouldRetry = opts?.shouldRetry ?? ((error: unknown) => isRetryableError(error));
                if (currentFailureCount >= maxAttempts || !shouldRetry(e, currentFailureCount)) {
                    throw e;
                }
                let waitForRequest = exponentialBackoffDelay(currentFailureCount, minDelay, maxDelay, maxFailureCount);
                await delay(waitForRequest);
            }
        }
        throw new Error('Backoff exhausted');
    };
}

export let backoff = createBackoff({ onError: (e) => { console.warn(e); } });
