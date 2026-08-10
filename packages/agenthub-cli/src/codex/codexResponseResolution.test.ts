import { describe, expect, it, vi } from 'vitest';
import { settleCodexResponse } from './codexResponseResolution';

function createPending(epoch = 3) {
    return {
        resolve: vi.fn(),
        reject: vi.fn(),
        method: 'thread/read',
        epoch,
    };
}

describe('settleCodexResponse', () => {
    it('resolves and removes a response from the current epoch', () => {
        const pending = new Map([[7, createPending()]]);
        const result = settleCodexResponse({
            pending,
            id: 7,
            sourceEpoch: 3,
            result: { thread: { id: 'thread-1' } },
        });

        expect(result).toBe('settled');
        expect(pending.size).toBe(0);
    });

    it('rejects with the existing method/code error shape', () => {
        const request = createPending();
        const pending = new Map([[7, request]]);

        settleCodexResponse({
            pending,
            id: 7,
            sourceEpoch: 3,
            error: { message: 'not found', code: -32601 },
        });

        expect(request.reject).toHaveBeenCalledWith(new Error('thread/read: not found (code=-32601)'));
        expect(pending.size).toBe(0);
    });

    it('keeps stale-epoch responses pending for the active request', () => {
        const request = createPending(4);
        const pending = new Map([[7, request]]);

        expect(settleCodexResponse({
            pending,
            id: 7,
            sourceEpoch: 3,
            result: 'stale',
        })).toBe('stale');

        expect(pending.get(7)).toBe(request);
        expect(request.resolve).not.toHaveBeenCalled();
        expect(request.reject).not.toHaveBeenCalled();
    });
});
