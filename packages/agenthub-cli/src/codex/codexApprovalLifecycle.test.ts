import { describe, expect, it, vi } from 'vitest';
import {
    cancelPendingApprovalResponses,
    createPendingApprovalResponder,
} from './codexApprovalLifecycle';

describe('codex approval lifecycle', () => {
    it('responds at most once and removes itself before writing', () => {
        const pending = new Map<number, () => void>();
        const respond = vi.fn();
        const respondOnce = createPendingApprovalResponder({
            id: 7,
            cancelResult: { decision: 'abort' },
            pending,
            respond,
        });

        respondOnce({ decision: 'accept' });
        respondOnce({ decision: 'deny' });

        expect(respond).toHaveBeenCalledTimes(1);
        expect(respond).toHaveBeenCalledWith(7, { decision: 'accept' });
        expect(pending.size).toBe(0);
    });

    it('cancels every pending approval and returns the number settled', () => {
        const pending = new Map<number, () => void>();
        const respond = vi.fn();
        createPendingApprovalResponder({ id: 1, cancelResult: 'abort-1', pending, respond });
        createPendingApprovalResponder({ id: 2, cancelResult: 'abort-2', pending, respond });

        expect(cancelPendingApprovalResponses(pending)).toBe(2);
        expect(respond).toHaveBeenNthCalledWith(1, 1, 'abort-1');
        expect(respond).toHaveBeenNthCalledWith(2, 2, 'abort-2');
        expect(pending.size).toBe(0);
    });
});
