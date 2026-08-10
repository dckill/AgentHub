import { describe, expect, it, vi } from 'vitest';
import { clearCodexThreadState } from './codexThreadStateReset';

describe('clearCodexThreadState', () => {
    it('resolves the active turn first, then clears all thread-scoped state', () => {
        const completedTurnIds = new Set(['completed-1']);
        const disconnectedTurnIds = new Set(['disconnected-1']);
        const recoveredTurnIds = new Set(['recovered-1']);
        const rawFileChangesByItemId = new Map([['item-1', { file: 'change' }]]);
        const events: string[] = [];

        clearCodexThreadState({
            threadId: 'thread-1',
            turnId: 'turn-1',
            resolvePendingTurn: (aborted, reason) => events.push(`resolve:${aborted}:${reason}`),
            setThreadId: (value) => events.push(`thread:${value ?? 'null'}`),
            setTurnId: (value) => events.push(`turn:${value ?? 'null'}`),
            setThreadDefaults: (value) => events.push(`defaults:${value ?? 'null'}`),
            completedTurnIds,
            disconnectedTurnIds,
            recoveredTurnIds,
            rawFileChangesByItemId,
            onLog: (thread, turn) => events.push(`log:${thread}:${turn}`),
        });

        expect(events).toEqual([
            'log:thread-1:turn-1',
            'resolve:true:interrupt',
            'thread:null',
            'turn:null',
            'defaults:null',
        ]);
        expect(completedTurnIds).toEqual(new Set());
        expect(disconnectedTurnIds).toEqual(new Set());
        expect(recoveredTurnIds).toEqual(new Set());
        expect(rawFileChangesByItemId).toEqual(new Map());
    });

    it('supports already-empty state without special casing at the call site', () => {
        const resolvePendingTurn = vi.fn();
        expect(() => clearCodexThreadState({
            threadId: null,
            turnId: null,
            resolvePendingTurn,
            setThreadId: vi.fn(),
            setTurnId: vi.fn(),
            setThreadDefaults: vi.fn(),
            completedTurnIds: new Set(),
            disconnectedTurnIds: new Set(),
            recoveredTurnIds: new Set(),
            rawFileChangesByItemId: new Map(),
        })).not.toThrow();
        expect(resolvePendingTurn).toHaveBeenCalledWith(true, 'interrupt');
    });
});
