import { describe, expect, it, vi } from 'vitest';
import { handleCodexRawNotification } from './codexRawNotificationHandler';

function harness() {
    let protocol: 'unknown' | 'legacy' | 'raw' = 'unknown';
    let turnId: string | null = null;
    const events: unknown[] = [];
    const changes = new Map();
    return {
        getProtocol: () => protocol,
        setProtocol: (value: 'unknown' | 'legacy' | 'raw') => { protocol = value; },
        getTurnId: () => turnId,
        setTurnId: (value: string | null) => { turnId = value; },
        hasPendingTurn: () => true,
        markPendingTurnStarted: vi.fn(),
        emitRawTurnCompletion: vi.fn(),
        rawFileChangesByItemId: changes,
        emit: (event: unknown) => events.push(event),
        events,
        changes,
    };
}

describe('handleCodexRawNotification', () => {
    it('handles turn started and locks the raw protocol', () => {
        const state = harness();

        expect(handleCodexRawNotification({
            method: 'turn/started',
            params: { turn: { id: 'turn-1' } },
            ...state,
        })).toBe(true);
        expect(state.getProtocol()).toBe('raw');
        expect(state.getTurnId()).toBe('turn-1');
        expect(state.markPendingTurnStarted).toHaveBeenCalledWith('turn-1');
        expect(state.events).toEqual([{ type: 'task_started', turn_id: 'turn-1' }]);
    });

    it('projects thread goals and token usage without changing client state', () => {
        const state = harness();

        expect(handleCodexRawNotification({
            method: 'thread/goal/updated',
            params: { threadId: 'thread-1', turnId: 'turn-1', goal: { status: 'active' } },
            ...state,
        })).toBe(true);
        expect(state.events).toEqual([{
            type: 'thread_goal_updated',
            thread_id: 'thread-1',
            threadId: 'thread-1',
            turn_id: 'turn-1',
            turnId: 'turn-1',
            goal: { status: 'active' },
        }]);
    });

    it('tracks file changes across item start/completion and ignores unrelated methods', () => {
        const state = harness();
        const item = { type: 'fileChange', id: 'item-1', changes: [{ path: 'a.ts', diff: '+a' }] };

        expect(handleCodexRawNotification({ method: 'item/started', params: { item }, ...state })).toBe(true);
        expect(state.changes.has('item-1')).toBe(true);
        expect(handleCodexRawNotification({
            method: 'item/completed',
            params: { item: { ...item, status: 'completed' } },
            ...state,
        })).toBe(true);
        expect(state.changes.has('item-1')).toBe(false);
        expect(handleCodexRawNotification({ method: 'unknown/method', params: {}, ...state })).toBe(false);
    });
});
