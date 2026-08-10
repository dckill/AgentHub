import { describe, expect, it } from 'vitest';
import { handleCodexLegacyNotification } from './codexLegacyNotificationHandler';

function createHarness() {
    const events: unknown[] = [];
    const started: Array<string | null | undefined> = [];
    const completed: Array<{ aborted: boolean; turnId: string | null; source: string }> = [];
    const remembered: string[] = [];
    let activeTurnId: string | null = null;

    return {
        events,
        started,
        completed,
        remembered,
        get activeTurnId() { return activeTurnId; },
        options: {
            emitEvent: (event: unknown) => events.push(event),
            setTurnId: (turnId: string | null) => { activeTurnId = turnId; },
            markPendingTurnStarted: (turnId?: string | null) => started.push(turnId),
            rememberCompletedTurnId: (turnId: string) => remembered.push(turnId),
            tryResolvePendingTurn: (aborted: boolean, turnId: string | null, source: string) => completed.push({ aborted, turnId, source }),
        },
    };
}

describe('codex legacy notification handler', () => {
    it('updates the active turn and emits task_started before completion bookkeeping', () => {
        const harness = createHarness();
        const handled = handleCodexLegacyNotification({
            ...harness.options,
            method: 'codex/event',
            params: { msg: { type: 'task_started', turn_id: 'turn-1' } },
        });

        expect(handled).toBe(true);
        expect(harness.activeTurnId).toBe('turn-1');
        expect(harness.started).toEqual(['turn-1']);
        expect(harness.events).toEqual([{ type: 'task_started', turn_id: 'turn-1' }]);
        expect(harness.completed).toHaveLength(0);
    });

    it('emits terminal events before resolving and clearing the completed turn', () => {
        const harness = createHarness();
        const handled = handleCodexLegacyNotification({
            ...harness.options,
            method: 'codex/event/turn_aborted',
            params: { msg: { type: 'turn_aborted', turnId: 'turn-2' } },
        });

        expect(handled).toBe(true);
        expect(harness.events).toEqual([{ type: 'turn_aborted', turnId: 'turn-2' }]);
        expect(harness.remembered).toEqual(['turn-2']);
        expect(harness.completed).toEqual([{ aborted: true, turnId: 'turn-2', source: 'codex/event/turn_aborted' }]);
        expect(harness.activeTurnId).toBe(null);
    });

    it('leaves v2 notifications for the regular handler', () => {
        const harness = createHarness();
        expect(handleCodexLegacyNotification({
            ...harness.options,
            method: 'turn/completed',
            params: {},
        })).toBe(false);
        expect(harness.events).toHaveLength(0);
    });
});
