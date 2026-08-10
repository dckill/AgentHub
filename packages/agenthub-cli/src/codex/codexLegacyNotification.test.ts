import { describe, expect, it } from 'vitest';
import { parseCodexLegacyNotification } from './codexLegacyNotification';

describe('parseCodexLegacyNotification', () => {
    it('rejects non-legacy methods', () => {
        expect(parseCodexLegacyNotification('turn/started', { msg: { type: 'task_started' } })).toEqual({ handled: false });
    });

    it('normalizes task-started ids without changing the legacy message', () => {
        const message = { type: 'task_started', turn_id: 'turn-1' };
        expect(parseCodexLegacyNotification('codex/event', { msg: message })).toEqual({
            handled: true,
            message,
            startedTurnId: 'turn-1',
            turnId: 'turn-1',
            isTaskStarted: true,
            isTerminal: false,
            aborted: false,
        });
    });

    it('marks both terminal event kinds and preserves camelCase compatibility', () => {
        expect(parseCodexLegacyNotification('codex/event/turn_aborted', {
            msg: { type: 'turn_aborted', turnId: 'turn-2' },
        })).toMatchObject({
            handled: true,
            turnId: 'turn-2',
            isTerminal: true,
            aborted: true,
        });
    });
});
