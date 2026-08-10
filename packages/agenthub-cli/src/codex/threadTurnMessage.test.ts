import { describe, expect, it } from 'vitest';
import { getLastAgentMessage } from './threadTurnMessage';

describe('getLastAgentMessage', () => {
    it('returns the last textual agent message and keeps its phase', () => {
        expect(getLastAgentMessage({
            items: [
                { type: 'agentMessage', id: 'a1', text: 'first' },
                { type: 'reasoning', id: 'r1' },
                { type: 'agentMessage', id: 'a2', text: 'final', phase: 'final_answer' },
            ],
        })).toEqual({ id: 'a2', text: 'final', phase: 'final_answer' });
    });

    it('returns null when a turn has no textual agent message', () => {
        expect(getLastAgentMessage({ items: [{ type: 'reasoning', id: 'r1' }] })).toBeNull();
    });
});
