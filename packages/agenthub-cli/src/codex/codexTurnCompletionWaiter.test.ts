import { describe, expect, it, vi } from 'vitest';
import { createCodexTurnCompletionWaiter } from './codexTurnCompletionWaiter';

describe('createCodexTurnCompletionWaiter', () => {
    it('resolves a completion and clears its timeout', async () => {
        vi.useFakeTimers();
        const onTimeout = vi.fn();
        const waiter = createCodexTurnCompletionWaiter({ timeoutMs: 10, onTimeout });

        waiter.resolve({ aborted: false });
        await expect(waiter.completion).resolves.toEqual({ aborted: false });
        waiter.clear();
        vi.advanceTimersByTime(20);

        expect(onTimeout).not.toHaveBeenCalled();
        vi.useRealTimers();
    });

    it('invokes the timeout callback once and still allows terminal resolution', async () => {
        vi.useFakeTimers();
        const onTimeout = vi.fn();
        const waiter = createCodexTurnCompletionWaiter({ timeoutMs: 10, onTimeout });

        vi.advanceTimersByTime(10);
        vi.advanceTimersByTime(10);
        expect(onTimeout).toHaveBeenCalledTimes(1);

        waiter.resolve({ aborted: true, reason: 'timeout' });
        await expect(waiter.completion).resolves.toEqual({ aborted: true, reason: 'timeout' });
        waiter.clear();
        vi.useRealTimers();
    });
});
