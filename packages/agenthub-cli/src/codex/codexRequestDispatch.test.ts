import { describe, expect, it, vi } from 'vitest';
import type { PendingCodexRequest } from './codexResponseResolution';
import { dispatchCodexRequest } from './codexRequestDispatch';

describe('dispatchCodexRequest', () => {
    const createOptions = (overrides: Partial<Parameters<typeof dispatchCodexRequest>[0]> = {}) => {
        const pending = new Map<number, PendingCodexRequest>();
        const stdin = { writable: true, write: vi.fn() };
        return {
            method: 'thread/read',
            params: { threadId: 'thread-1' },
            timeoutMs: 1000,
            processEpoch: 4,
            stdin,
            nextId: vi.fn(() => 7),
            pending,
            onWrite: vi.fn(),
            ...overrides,
        };
    };

    it('rejects without allocating or writing when stdin is unavailable', async () => {
        const options = createOptions({ stdin: null });

        await expect(dispatchCodexRequest(options)).rejects.toThrow('Cannot send thread/read: stdin not writable');
        expect(options.nextId).not.toHaveBeenCalled();
        expect(options.pending).toEqual(new Map());
    });

    it('registers a pending request and writes one JSON-RPC line', async () => {
        const options = createOptions();
        const promise = dispatchCodexRequest(options);

        expect(options.nextId).toHaveBeenCalledOnce();
        expect(options.pending).toHaveProperty('size', 1);
        expect(options.stdin?.write).toHaveBeenCalledWith(
            '{"jsonrpc":"2.0","id":7,"method":"thread/read","params":{"threadId":"thread-1"}}\n',
        );
        expect(options.onWrite).toHaveBeenCalledWith('thread/read', 7);

        const request = options.pending.get(7);
        request?.resolve({ thread: { id: 'thread-1' } });
        await expect(promise).resolves.toEqual({ thread: { id: 'thread-1' } });
    });

    it('removes the pending request when its timeout fires', async () => {
        vi.useFakeTimers();
        try {
            const options = createOptions({ timeoutMs: 10 });
            const promise = dispatchCodexRequest(options);
            vi.advanceTimersByTime(10);
            await expect(promise).rejects.toThrow('thread/read timed out after 10ms (id=7)');
            expect(options.pending).toEqual(new Map());
        } finally {
            vi.useRealTimers();
        }
    });
});
