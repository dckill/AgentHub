import { describe, expect, it, vi } from 'vitest';
import { emitCodexRawTurnCompletion } from './codexRawTurnCompletion';

describe('emitCodexRawTurnCompletion', () => {
    it('emits an aborted event with the completion metadata', () => {
        const emit = vi.fn();
        const resolve = vi.fn();

        emitCodexRawTurnCompletion({
            turnId: 'turn-1',
            status: 'cancelled',
            error: { message: 'cancelled' },
            source: 'turn/completed',
            tryResolvePendingTurn: resolve,
            clearTurn: vi.fn(),
            hasCompletedTurn: () => false,
            rememberCompletedTurn: vi.fn(),
            emit,
        });

        expect(resolve).toHaveBeenCalledWith(true, 'turn-1', 'turn/completed');
        expect(emit).toHaveBeenCalledWith({
            type: 'turn_aborted',
            turn_id: 'turn-1',
            status: 'cancelled',
            error: { message: 'cancelled' },
        });
    });

    it('emits a completed event and remembers the turn once', () => {
        const emit = vi.fn();
        const remember = vi.fn();

        emitCodexRawTurnCompletion({
            turnId: 'turn-2',
            status: 'completed',
            error: null,
            source: 'turn/completed',
            tryResolvePendingTurn: vi.fn(),
            clearTurn: vi.fn(),
            hasCompletedTurn: () => false,
            rememberCompletedTurn: remember,
            emit,
        });

        expect(remember).toHaveBeenCalledWith('turn-2');
        expect(emit).toHaveBeenCalledWith({ type: 'task_complete', turn_id: 'turn-2', status: 'completed' });
    });

    it('suppresses a duplicate completion after resolving the pending turn', () => {
        const emit = vi.fn();
        const clearTurn = vi.fn();

        emitCodexRawTurnCompletion({
            turnId: 'turn-3',
            status: 'completed',
            error: null,
            source: 'item/agentMessage',
            tryResolvePendingTurn: vi.fn(),
            clearTurn,
            hasCompletedTurn: () => true,
            rememberCompletedTurn: vi.fn(),
            emit,
        });

        expect(clearTurn).toHaveBeenCalledOnce();
        expect(emit).not.toHaveBeenCalled();
    });
});
