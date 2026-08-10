import { describe, expect, it } from 'vitest';
import type { ThreadTurn } from './codexAppServerTypes';
import { selectRecoverableCodexTurns } from './codexTurnRecovery';

describe('selectRecoverableCodexTurns', () => {
    const turn = (overrides: Partial<ThreadTurn>): ThreadTurn => ({
        id: 'turn-1',
        items: [{ type: 'agentMessage', id: 'message-1', text: 'done', phase: 'final_answer' }],
        status: 'completed',
        completedAt: 1,
        ...overrides,
    });

    it('selects only disconnected completed turns and carries the final message', () => {
        expect(selectRecoverableCodexTurns({
            turns: [turn({}), turn({ id: 'turn-2', status: 'inProgress' }), turn({ id: 'turn-3', status: undefined, completedAt: null })],
            disconnectedTurnIds: new Set(['turn-1', 'turn-2', 'turn-3']),
            completedTurnIds: new Set(),
        })).toEqual([{
            turnId: 'turn-1',
            finalMessage: { id: 'message-1', text: 'done', phase: 'final_answer' },
        }]);
    });

    it('does not re-emit turns already present in the bounded completion set', () => {
        expect(selectRecoverableCodexTurns({
            turns: [turn({})],
            disconnectedTurnIds: new Set(['turn-1']),
            completedTurnIds: new Set(['turn-1']),
        })).toEqual([{
            turnId: 'turn-1',
            finalMessage: { id: 'message-1', text: 'done', phase: 'final_answer' },
            alreadyCompleted: true,
        }]);
    });
});
