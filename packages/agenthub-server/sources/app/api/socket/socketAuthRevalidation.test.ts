import { describe, expect, it, vi } from 'vitest';
import { startSocketAuthRevalidation } from './socketAuthRevalidation';

describe('startSocketAuthRevalidation', () => {
    it('disconnects an established socket after its token is revoked', async () => {
        let tick: (() => void) | undefined;
        const clearInterval = vi.fn();
        const disconnect = vi.fn();

        startSocketAuthRevalidation({
            token: 'token-1',
            verifyToken: vi.fn(async () => null),
            disconnect,
            intervalMs: 15000,
            setInterval: (callback) => {
                tick = callback;
                return 1 as unknown as ReturnType<typeof setInterval>;
            },
            clearInterval,
        });

        tick?.();
        await Promise.resolve();

        expect(disconnect).toHaveBeenCalledWith(true);
        expect(clearInterval).toHaveBeenCalledWith(1);
    });

    it('fails closed on verifier errors and stops future checks on cleanup', async () => {
        let tick: (() => void) | undefined;
        const clearInterval = vi.fn();
        const disconnect = vi.fn();
        const verifyToken = vi.fn(async () => {
            throw new Error('database unavailable');
        });

        const stop = startSocketAuthRevalidation({
            token: 'token-1',
            verifyToken,
            disconnect,
            intervalMs: 15000,
            setInterval: (callback) => {
                tick = callback;
                return 2 as unknown as ReturnType<typeof setInterval>;
            },
            clearInterval,
        });

        stop();
        expect(clearInterval).toHaveBeenCalledWith(2);

        tick?.();
        await Promise.resolve();
        expect(verifyToken).not.toHaveBeenCalled();
        expect(disconnect).not.toHaveBeenCalled();
    });
});
