import { describe, expect, it, vi } from 'vitest';
import { steerCodexActiveTurn } from './codexSteerActiveTurn';

describe('steerCodexActiveTurn', () => {
    it('rejects steering when the active thread/turn guard is not satisfied', async () => {
        const request = vi.fn();

        await expect(steerCodexActiveTurn({
            threadId: null,
            turnId: 'turn-1',
            hasPendingTurn: true,
            prompt: 'focus tests',
            request,
        })).resolves.toEqual({ steered: false, reason: 'no-active-turn' });

        expect(request).not.toHaveBeenCalled();
    });

    it('sends the expected turn and optional client message id', async () => {
        const request = vi.fn(async () => ({ turnId: 'turn-2' }));

        await expect(steerCodexActiveTurn({
            threadId: 'thread-1',
            turnId: 'turn-1',
            hasPendingTurn: true,
            prompt: 'focus tests',
            clientUserMessageId: 'message-1',
            request,
        })).resolves.toEqual({ steered: true, turnId: 'turn-2' });

        expect(request).toHaveBeenCalledWith({
            threadId: 'thread-1',
            expectedTurnId: 'turn-1',
            input: [{ type: 'text', text: 'focus tests' }],
            clientUserMessageId: 'message-1',
        });
    });

    it('returns rejected with the original error and logs through the callback', async () => {
        const error = new Error('steer rejected');
        const request = vi.fn(async () => { throw error; });
        const onError = vi.fn();

        await expect(steerCodexActiveTurn({
            threadId: 'thread-1',
            turnId: 'turn-1',
            hasPendingTurn: true,
            prompt: 'focus tests',
            request,
            onError,
        })).resolves.toEqual({ steered: false, reason: 'rejected', error });
        expect(onError).toHaveBeenCalledWith(error);
    });
});
