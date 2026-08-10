import { describe, expect, it, vi } from 'vitest';
import { sendCodexTurn } from './codexSendTurn';

describe('sendCodexTurn', () => {
    it('fails before building or sending when there is no active thread', async () => {
        const buildParams = vi.fn();
        const request = vi.fn();

        await expect(sendCodexTurn({
            threadId: null,
            buildParams,
            request,
            setTurnId: vi.fn(),
            setPendingTurnId: vi.fn(),
        })).rejects.toThrow('No active thread. Call startThread first.');
        expect(buildParams).not.toHaveBeenCalled();
        expect(request).not.toHaveBeenCalled();
    });

    it('builds and sends turn/start, then mirrors the returned turn id', async () => {
        const params = { threadId: 'thread-1', input: [{ type: 'text', text: 'hello' }] };
        const buildParams = vi.fn(() => params);
        const request = vi.fn(async () => ({ turn: { id: 'turn-1' } }));
        const setTurnId = vi.fn();
        const setPendingTurnId = vi.fn();

        await expect(sendCodexTurn({
            threadId: 'thread-1',
            buildParams,
            request,
            setTurnId,
            setPendingTurnId,
        })).resolves.toBeUndefined();

        expect(buildParams).toHaveBeenCalledOnce();
        expect(request).toHaveBeenCalledWith(params);
        expect(setTurnId).toHaveBeenCalledWith('turn-1');
        expect(setPendingTurnId).toHaveBeenCalledWith('turn-1');
    });

    it('does not write a turn id when the server response has no id', async () => {
        const setTurnId = vi.fn();
        const setPendingTurnId = vi.fn();

        await sendCodexTurn({
            threadId: 'thread-1',
            buildParams: () => ({}),
            request: vi.fn(async () => ({ turn: {} })),
            setTurnId,
            setPendingTurnId,
        });

        expect(setTurnId).not.toHaveBeenCalled();
        expect(setPendingTurnId).not.toHaveBeenCalled();
    });
});
