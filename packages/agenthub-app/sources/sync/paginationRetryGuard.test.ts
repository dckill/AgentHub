import { describe, expect, it } from 'vitest';

import { PaginationRetryGuard } from './paginationRetryGuard';

describe('PaginationRetryGuard', () => {
    it('blocks pagination while the browser is offline without consuming retry budget', () => {
        const guard = new PaginationRetryGuard();

        expect(guard.canStart('session-a', { online: false, now: 1_000 })).toBe(false);
        expect(guard.canStart('session-a', { online: true, now: 1_000 })).toBe(true);
    });

    it('backs off repeated failures per session and resets after success', () => {
        const guard = new PaginationRetryGuard({ baseDelayMs: 1_000, maxDelayMs: 4_000 });

        guard.recordFailure('session-a', 1_000);
        expect(guard.canStart('session-a', { online: true, now: 1_999 })).toBe(false);
        expect(guard.canStart('session-a', { online: true, now: 2_000 })).toBe(true);

        guard.recordFailure('session-a', 2_000);
        expect(guard.canStart('session-a', { online: true, now: 3_999 })).toBe(false);
        expect(guard.canStart('session-a', { online: true, now: 4_000 })).toBe(true);

        guard.recordFailure('session-a', 4_000);
        guard.recordFailure('session-a', 8_000);
        expect(guard.canStart('session-a', { online: true, now: 11_999 })).toBe(false);
        expect(guard.canStart('session-a', { online: true, now: 12_000 })).toBe(true);

        guard.recordSuccess('session-a');
        expect(guard.canStart('session-a', { online: true, now: 8_001 })).toBe(true);
    });

    it('isolates sessions and supports targeted and global cleanup', () => {
        const guard = new PaginationRetryGuard();

        guard.recordFailure('session-a', 1_000);
        guard.recordFailure('session-b', 1_000);
        guard.clear('session-a');
        expect(guard.canStart('session-a', { online: true, now: 1_001 })).toBe(true);
        expect(guard.canStart('session-b', { online: true, now: 1_001 })).toBe(false);

        guard.clearAll();
        expect(guard.canStart('session-b', { online: true, now: 1_001 })).toBe(true);
    });
});
