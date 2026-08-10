import { describe, expect, it, vi } from 'vitest';
import type { ThreadTurn } from './codexAppServerTypes';
import { reconcileDisconnectedCodexTurns } from './codexDisconnectedTurnReconciliation';

describe('reconcileDisconnectedCodexTurns', () => {
    const completedTurn = (id: string, text = 'recovered answer'): ThreadTurn => ({
        id,
        items: [{ type: 'agentMessage', id: `${id}-message`, text, phase: 'final_answer' }],
        status: 'completed',
        completedAt: 1,
    });

    it('projects a recovered final message and completion, then clears the disconnected id', async () => {
        const disconnectedTurnIds = new Set(['turn-1']);
        const events: Array<Record<string, unknown>> = [];
        const markRecoveredTurnId = vi.fn();
        const rememberCompletedTurnId = vi.fn();

        await reconcileDisconnectedCodexTurns({
            threadId: 'thread-1',
            disconnectedTurnIds,
            completedTurnIds: new Set(),
            readThread: vi.fn(async () => ({ thread: { turns: [completedTurn('turn-1')] } })),
            emitEvent: (event) => events.push(event),
            markRecoveredTurnId,
            rememberCompletedTurnId,
        });

        expect(disconnectedTurnIds).toEqual(new Set());
        expect(markRecoveredTurnId).toHaveBeenCalledWith('turn-1');
        expect(rememberCompletedTurnId).toHaveBeenCalledWith('turn-1');
        expect(events).toEqual([
            {
                type: 'agent_message',
                message: 'recovered answer',
                item_id: 'turn-1-message',
                turn_id: 'turn-1',
                phase: 'final_answer',
            },
            { type: 'task_complete', turn_id: 'turn-1', status: 'completed', recovered: true },
        ]);
    });

    it('does not re-emit a turn already completed, and reports read failures without throwing', async () => {
        const disconnectedTurnIds = new Set(['turn-1']);
        const events: Array<Record<string, unknown>> = [];
        const markRecoveredTurnId = vi.fn();
        const onError = vi.fn();

        await reconcileDisconnectedCodexTurns({
            threadId: 'thread-1',
            disconnectedTurnIds,
            completedTurnIds: new Set(['turn-1']),
            readThread: vi.fn(async () => ({ thread: { turns: [completedTurn('turn-1')] } })),
            emitEvent: (event) => events.push(event),
            markRecoveredTurnId,
            rememberCompletedTurnId: vi.fn(),
        });

        expect(disconnectedTurnIds).toEqual(new Set());
        expect(markRecoveredTurnId).toHaveBeenCalledWith('turn-1');
        expect(events).toEqual([]);

        const error = new Error('thread/read unavailable');
        await reconcileDisconnectedCodexTurns({
            threadId: 'thread-1',
            disconnectedTurnIds: new Set(['turn-2']),
            completedTurnIds: new Set(),
            readThread: vi.fn(async () => { throw error; }),
            emitEvent: (event) => events.push(event),
            markRecoveredTurnId,
            rememberCompletedTurnId: vi.fn(),
            onError,
        });

        expect(onError).toHaveBeenCalledWith(error);
    });
});
