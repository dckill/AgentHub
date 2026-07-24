import { describe, expect, it, vi } from 'vitest';
import { createBackoff, exponentialBackoffDelay, HttpStatusError } from './time';

describe('createBackoff', () => {
    it('never retries an aborted account request', async () => {
        const operation = vi.fn()
            .mockRejectedValueOnce(new DOMException('Account lifecycle is stale', 'AbortError'))
            .mockResolvedValueOnce('must-not-retry');
        const run = createBackoff({ minDelay: 0, maxDelay: 0 });

        await expect(run(operation)).rejects.toMatchObject({ name: 'AbortError' });
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('does not multiply an explicit request timeout across the retry budget', async () => {
        const timeout = new Error('HTTP request timed out after 50ms');
        timeout.name = 'TimeoutError';
        const operation = vi.fn()
            .mockRejectedValueOnce(timeout)
            .mockResolvedValueOnce('must-not-retry');
        const run = createBackoff({ minDelay: 0, maxDelay: 0, maxAttempts: 6 });

        await expect(run(operation)).rejects.toMatchObject({ name: 'TimeoutError' });
        expect(operation).toHaveBeenCalledTimes(1);
    });

    it('stops after the configured maximum attempts', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('offline'));
        const run = createBackoff({ minDelay: 0, maxDelay: 0, maxAttempts: 3 });

        await expect(run(operation)).rejects.toThrow('offline');
        expect(operation).toHaveBeenCalledTimes(3);
    });

    it('does not retry errors rejected by the retry policy', async () => {
        const operation = vi.fn().mockRejectedValue(new Error('HTTP 401'));
        const run = createBackoff({
            minDelay: 0,
            maxDelay: 0,
            maxAttempts: 5,
            shouldRetry: () => false,
        });

        await expect(run(operation)).rejects.toThrow('HTTP 401');
        expect(operation).toHaveBeenCalledOnce();
    });

    it('does not retry permanent HTTP failures by default', async () => {
        const operation = vi.fn().mockRejectedValue(new HttpStatusError(401, 'unauthorized'));
        const run = createBackoff({ minDelay: 0, maxDelay: 0, maxAttempts: 3 });

        await expect(run(operation)).rejects.toMatchObject({ status: 401 });
        expect(operation).toHaveBeenCalledOnce();
    });

    it('retries transient HTTP failures within the attempt budget', async () => {
        const operation = vi.fn().mockRejectedValue(new HttpStatusError(503, 'unavailable'));
        const run = createBackoff({ minDelay: 0, maxDelay: 0, maxAttempts: 3 });

        await expect(run(operation)).rejects.toMatchObject({ status: 503 });
        expect(operation).toHaveBeenCalledTimes(3);
    });

    it('uses capped exponential delays instead of jumping to the maximum immediately', () => {
        vi.spyOn(Math, 'random').mockReturnValue(1);
        expect(exponentialBackoffDelay(1, 250, 4_000, 50)).toBe(250);
        expect(exponentialBackoffDelay(2, 250, 4_000, 50)).toBe(500);
        expect(exponentialBackoffDelay(10, 250, 4_000, 50)).toBe(4_000);
    });
});
