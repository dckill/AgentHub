import { describe, expect, it, vi } from 'vitest';
import {
    clearCodexThreadGoal,
    injectCodexItems,
    readCodexThread,
    rollbackCodexThread,
    setCodexThreadGoal,
} from './codexThreadOperations';

describe('Codex thread RPC operations', () => {
    it('builds a read request with the default includeTurns flag', async () => {
        const request = vi.fn().mockResolvedValue({ thread: { id: 'thread-1' } });

        await expect(readCodexThread({ threadId: 'thread-1', request })).resolves.toEqual({
            thread: { id: 'thread-1' },
        });
        expect(request).toHaveBeenCalledWith('thread/read', {
            threadId: 'thread-1',
            includeTurns: true,
        });
    });

    it('preserves explicit read, rollback, and inject parameters', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
            .mockResolvedValueOnce({ thread: { id: 'thread-1' } })
            .mockResolvedValueOnce({});

        await readCodexThread({ threadId: 'thread-1', includeTurns: false, request });
        await rollbackCodexThread({ threadId: 'thread-1', numTurns: 2, request });
        await injectCodexItems({
            threadId: 'thread-1',
            items: [{ type: 'message', role: 'user' }],
            request,
        });

        expect(request.mock.calls).toEqual([
            ['thread/read', { threadId: 'thread-1', includeTurns: false }],
            ['thread/rollback', { threadId: 'thread-1', numTurns: 2 }],
            ['thread/inject_items', {
                threadId: 'thread-1',
                items: [{ type: 'message', role: 'user' }],
            }],
        ]);
    });

    it('builds goal set and clear requests through the shared goal parameter builders', async () => {
        const request = vi.fn()
            .mockResolvedValueOnce({ goal: { threadId: 'thread-1' } })
            .mockResolvedValueOnce({ cleared: true });

        await setCodexThreadGoal({
            threadId: 'thread-1',
            objective: 'ship it',
            status: 'active',
            tokenBudget: 500,
            request,
        });
        await clearCodexThreadGoal({ threadId: 'thread-1', request });

        expect(request.mock.calls).toEqual([
            ['thread/goal/set', {
                threadId: 'thread-1',
                objective: 'ship it',
                status: 'active',
                tokenBudget: 500,
            }],
            ['thread/goal/clear', { threadId: 'thread-1' }],
        ]);
    });
});
