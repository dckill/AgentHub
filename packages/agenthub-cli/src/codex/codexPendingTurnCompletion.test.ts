import { describe, expect, it, vi } from 'vitest';
import { resolveCodexPendingTurn } from './codexPendingTurnCompletion';

describe('resolveCodexPendingTurn', () => {
    it('resolves an aborted turn, cancels approvals, and clears the pending slot', () => {
        const resolve = vi.fn();
        const cancelApprovals = vi.fn();
        const clearPending = vi.fn();

        expect(resolveCodexPendingTurn({
            pending: { resolve, turnId: 'turn-1' },
            aborted: true,
            reason: 'interrupt',
            cancelApprovals,
            clearPending,
        })).toBe(true);

        expect(cancelApprovals).toHaveBeenCalledOnce();
        expect(resolve).toHaveBeenCalledWith({ aborted: true, reason: 'interrupt' });
        expect(clearPending).toHaveBeenCalledOnce();
    });

    it('resolves a completed turn without an abort-only reason', () => {
        const resolve = vi.fn();
        const cancelApprovals = vi.fn();
        const clearPending = vi.fn();

        expect(resolveCodexPendingTurn({
            pending: { resolve, turnId: 'turn-2' },
            aborted: false,
            reason: undefined,
            cancelApprovals,
            clearPending,
        })).toBe(true);

        expect(cancelApprovals).not.toHaveBeenCalled();
        expect(resolve).toHaveBeenCalledWith({ aborted: false });
        expect(clearPending).toHaveBeenCalledOnce();
    });

    it('does nothing when no turn is pending', () => {
        expect(resolveCodexPendingTurn({
            pending: null,
            aborted: true,
            reason: 'backend-failure',
            cancelApprovals: vi.fn(),
            clearPending: vi.fn(),
        })).toBe(false);
    });
});
