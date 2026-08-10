import { describe, expect, it, vi } from 'vitest';
import { resolveCodexPendingTurnLifecycle } from './codexPendingTurnResolutionLifecycle';

describe('codex pending turn resolution lifecycle', () => {
    it('ignores an explicit stale completion without resolving the pending turn', () => {
        const resolve = vi.fn();
        const logStale = vi.fn();

        expect(resolveCodexPendingTurnLifecycle({
            pendingTurnId: 'turn-1',
            notificationTurnId: 'turn-2',
            aborted: false,
            source: 'turn/completed',
            resolve,
            logStale,
        })).toBe(false);

        expect(resolve).not.toHaveBeenCalled();
        expect(logStale).toHaveBeenCalledWith('turn/completed', 'turn-2', 'turn-1');
    });

    it('accepts matching and id-less completions with the correct interrupt reason', () => {
        const resolve = vi.fn();
        const logStale = vi.fn();

        expect(resolveCodexPendingTurnLifecycle({
            pendingTurnId: null,
            notificationTurnId: 'turn-1',
            aborted: true,
            source: 'codex/event/turn_aborted',
            resolve,
            logStale,
        })).toBe(true);

        expect(resolve).toHaveBeenCalledWith(true, 'interrupt');
        expect(logStale).not.toHaveBeenCalled();
    });

    it('fails closed when no pending completion exists', () => {
        const resolve = vi.fn();

        expect(resolveCodexPendingTurnLifecycle({
            pendingTurnId: undefined,
            notificationTurnId: null,
            aborted: false,
            source: 'turn/completed',
            resolve,
            logStale: vi.fn(),
        })).toBe(false);

        expect(resolve).not.toHaveBeenCalled();
    });
});
