import { describe, expect, it } from 'vitest';
import { MessagePaginationState } from './messagePaginationState';

describe('MessagePaginationState', () => {
    it('keeps cursor state isolated per session', () => {
        const state = new MessagePaginationState();
        state.setLastSeq('session-a', 10);
        state.setFirstSeq('session-a', 3);
        state.setHasMoreBefore('session-a', true);

        expect(state.getLastSeq('session-a')).toBe(10);
        expect(state.getFirstSeq('session-a')).toBe(3);
        expect(state.getHasMoreBefore('session-a')).toBe(true);
        expect(state.getLastSeq('session-b')).toBeUndefined();
    });

    it('supports targeted and global cleanup', () => {
        const state = new MessagePaginationState();
        state.setLastSeq('session-a', 10);
        state.setLastSeq('session-b', 20);

        state.clearSession('session-a');
        expect(state.getLastSeq('session-a')).toBeUndefined();
        expect(state.getLastSeq('session-b')).toBe(20);

        state.clearAll();
        expect(state.getLastSeq('session-b')).toBeUndefined();
    });
});
