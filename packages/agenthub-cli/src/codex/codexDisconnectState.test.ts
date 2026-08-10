import { describe, expect, it } from 'vitest';
import { projectCodexDisconnectState } from './codexDisconnectState';

describe('projectCodexDisconnectState', () => {
    it('preserves thread state while recording the interrupted turn and resetting transport state', () => {
        const disconnectedTurnIds = new Set<string>();
        const events: string[] = [];
        const state = projectCodexDisconnectState({
            preserveThreadState: true,
            pendingTurnId: 'turn-1',
            disconnectedTurnIds,
            setTurnId: (value) => events.push(`turn:${value ?? 'null'}`),
            setNotificationProtocol: (value) => events.push(`protocol:${value}`),
            clearThreadState: () => events.push('clear-thread'),
        });

        expect(state).toEqual({ recordedDisconnectedTurn: true });
        expect(disconnectedTurnIds).toEqual(new Set(['turn-1']));
        expect(events).toEqual(['turn:null', 'protocol:unknown']);
    });

    it('clears thread state on a terminal disconnect without recording an empty turn', () => {
        const disconnectedTurnIds = new Set<string>();
        const clearThreadState = () => {};

        expect(projectCodexDisconnectState({
            preserveThreadState: false,
            pendingTurnId: null,
            disconnectedTurnIds,
            setTurnId: () => {},
            setNotificationProtocol: () => {},
            clearThreadState,
        })).toEqual({ recordedDisconnectedTurn: false });
        expect(disconnectedTurnIds).toEqual(new Set());
    });
});
