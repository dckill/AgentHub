import { describe, expect, it, vi } from 'vitest';
import { createCodexPendingRequest } from './codexRequestLifecycle';

describe('createCodexPendingRequest', () => {
    it('clears its timer when the response settles', () => {
        const clearTimeout = vi.fn();
        const resolve = vi.fn();
        const reject = vi.fn();
        const timer = {} as ReturnType<typeof setTimeout>;
        const pending = createCodexPendingRequest({
            method: 'thread/start',
            epoch: 4,
            timeoutMs: 100,
            resolve,
            reject,
            schedule: () => timer,
            clearTimeout,
        });

        pending.resolve({ ok: true });
        expect(resolve).toHaveBeenCalledWith({ ok: true });
        expect(clearTimeout).toHaveBeenCalledWith(timer);
        expect(pending.method).toBe('thread/start');
        expect(pending.epoch).toBe(4);
    });

    it('rejects on timeout and removes the pending entry', () => {
        const reject = vi.fn();
        const remove = vi.fn();
        let timeout: (() => void) | undefined;
        const pending = createCodexPendingRequest({
            method: 'thread/read',
            epoch: 2,
            timeoutMs: 250,
            resolve: vi.fn(),
            reject,
            schedule: (callback) => {
                timeout = callback;
                return {} as ReturnType<typeof setTimeout>;
            },
            clearTimeout: vi.fn(),
            remove,
        });

        timeout?.();
        expect(remove).toHaveBeenCalledOnce();
        expect(reject.mock.calls[0]?.[0]).toEqual(new Error('thread/read timed out after 250ms'));
        expect(pending.method).toBe('thread/read');
    });
});
