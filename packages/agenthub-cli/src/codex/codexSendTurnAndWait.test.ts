import { describe, expect, it, vi } from 'vitest';
import { runCodexSendTurnAndWait } from './codexSendTurnAndWait';

describe('runCodexSendTurnAndWait', () => {
    it('waits for a prior interrupt before starting the next turn', async () => {
        const events: string[] = [];
        let resolveInterrupt!: () => void;
        const interrupt = new Promise<void>((resolve) => { resolveInterrupt = resolve; });
        const sendTurn = vi.fn(async () => { events.push('send'); throw new Error('after interrupt'); });
        const result = runCodexSendTurnAndWait({
            pendingInterrupt: interrupt,
            timeoutMs: 1000,
            setPendingTurn: vi.fn(),
            clearPendingTurn: vi.fn(),
            resolveOnTimeout: vi.fn(),
            sendTurn: async () => { events.push('send'); await sendTurn(); },
        });

        await Promise.resolve();
        expect(events).toEqual([]);
        resolveInterrupt();
        // The helper yields once so stale notifications can be consumed first.
        await expect(result).rejects.toThrow();
    });

    it('clears the pending turn when sendTurn fails', async () => {
        const clearPendingTurn = vi.fn();
        const error = new Error('send failed');

        await expect(runCodexSendTurnAndWait({
            pendingInterrupt: null,
            timeoutMs: 1000,
            setPendingTurn: vi.fn(),
            clearPendingTurn,
            resolveOnTimeout: vi.fn(),
            sendTurn: async () => { throw error; },
        })).rejects.toBe(error);
        expect(clearPendingTurn).toHaveBeenCalledOnce();
    });

    it('returns the terminal completion result and clears the waiter', async () => {
        let resolvePending!: (result: { aborted: boolean; reason?: 'timeout' | 'interrupt' | 'backend-failure' }) => void;
        const clearPendingTurn = vi.fn();
        const resultPromise = runCodexSendTurnAndWait({
            pendingInterrupt: null,
            timeoutMs: 1000,
            setPendingTurn: (resolve) => { resolvePending = resolve; },
            clearPendingTurn,
            resolveOnTimeout: vi.fn(),
            sendTurn: async () => undefined,
        });

        resolvePending({ aborted: false });
        await expect(resultPromise).resolves.toEqual({ aborted: false });
        expect(clearPendingTurn).not.toHaveBeenCalled();
    });
});
