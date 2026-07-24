import { describe, expect, it } from 'vitest';

import { HistoryPaginationGate } from './historyPaginationGate';

describe('HistoryPaginationGate', () => {
    it('allows only one page until a new post-load user gesture', () => {
        const gate = new HistoryPaginationGate();

        expect(gate.tryStart({ hasMore: true, isLoading: false })).toBe(true);
        expect(gate.tryStart({ hasMore: true, isLoading: false })).toBe(false);

        gate.onUserGesture({ isLoading: true });
        expect(gate.tryStart({ hasMore: true, isLoading: false })).toBe(false);

        gate.onUserGesture({ isLoading: false });
        expect(gate.tryStart({ hasMore: true, isLoading: false })).toBe(true);
    });

    it('does not consume the gesture gate when loading cannot start', () => {
        const gate = new HistoryPaginationGate();

        expect(gate.tryStart({ hasMore: false, isLoading: false })).toBe(false);
        expect(gate.tryStart({ hasMore: true, isLoading: true })).toBe(false);
        expect(gate.tryStart({ hasMore: true, isLoading: false })).toBe(true);
    });

    it('resets when the visible session changes', () => {
        const gate = new HistoryPaginationGate();

        expect(gate.tryStart({ hasMore: true, isLoading: false })).toBe(true);
        gate.reset();
        expect(gate.tryStart({ hasMore: true, isLoading: false })).toBe(true);
    });
});
