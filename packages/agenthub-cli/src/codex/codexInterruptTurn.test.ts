import { describe, expect, it, vi } from 'vitest';
import { interruptCodexTurn } from './codexInterruptTurn';

describe('interruptCodexTurn', () => {
    it('skips when thread or turn state is unavailable', async () => {
        const request = vi.fn();
        const onFinally = vi.fn();

        await interruptCodexTurn({ threadId: null, turnId: 'turn-1', request, onFinally });
        await interruptCodexTurn({ threadId: 'thread-1', turnId: null, request, onFinally });

        expect(request).not.toHaveBeenCalled();
        expect(onFinally).not.toHaveBeenCalled();
    });

    it('sends the active thread/turn pair and always clears pending state', async () => {
        const request = vi.fn(async () => undefined);
        const onFinally = vi.fn();

        await interruptCodexTurn({ threadId: 'thread-1', turnId: 'turn-1', request, onFinally });

        expect(request).toHaveBeenCalledWith({ threadId: 'thread-1', turnId: 'turn-1' });
        expect(onFinally).toHaveBeenCalledOnce();
    });

    it('reports request failures without rejecting the interrupt operation', async () => {
        const error = new Error('turn already ended');
        const request = vi.fn(async () => { throw error; });
        const onError = vi.fn();
        const onFinally = vi.fn();

        await expect(interruptCodexTurn({
            threadId: 'thread-1',
            turnId: 'turn-1',
            request,
            onError,
            onFinally,
        })).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledWith(error);
        expect(onFinally).toHaveBeenCalledOnce();
    });
});
