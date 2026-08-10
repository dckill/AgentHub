import { describe, expect, it, vi } from 'vitest';
import { AbortedExeption } from './aborted';
import { createBackoff } from './backoff';

describe('createBackoff', () => {
    it('increases the delay after each consecutive failure', async () => {
        vi.useFakeTimers();
        try {
            let attempts = 0;
            const run = createBackoff({ minDelay: 10, maxDelay: 100, factor: 0 })(async () => {
                attempts += 1;
                if (attempts < 3) {
                    throw new Error('temporary failure');
                }
                return 'ok';
            });

            await vi.advanceTimersByTimeAsync(0);
            expect(attempts).toBe(1);

            await vi.advanceTimersByTimeAsync(10);
            expect(attempts).toBe(2);

            await vi.advanceTimersByTimeAsync(19);
            expect(attempts).toBe(2);

            await vi.advanceTimersByTimeAsync(1);
            await expect(run).resolves.toBe('ok');
            expect(attempts).toBe(3);
        } finally {
            vi.useRealTimers();
        }
    });

    it('stops retrying when its abort signal is triggered during the delay', async () => {
        const controller = new AbortController();
        let attempts = 0;
        const run = createBackoff({ minDelay: 10_000, maxDelay: 10_000 })(async () => {
            attempts += 1;
            throw new Error('temporary failure');
        }, controller.signal);

        await Promise.resolve();
        controller.abort();

        await expect(run).rejects.toBeInstanceOf(AbortedExeption);
        expect(attempts).toBe(1);
    });
});
