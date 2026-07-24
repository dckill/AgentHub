import { describe, expect, it } from 'vitest';
import { resolveCollapsedGroupIds, type GroupCollapseOverrides } from './groupCollapseState';

const completed = { type: 'agent-work-group' as const, id: 'completed', hasPendingPermission: false, hasRunning: false };
const pending = { type: 'tool-group' as const, id: 'pending', hasPendingPermission: true, hasRunning: false };
const running = { type: 'tool-group' as const, id: 'running', hasPendingPermission: false, hasRunning: true };

describe('resolveCollapsedGroupIds', () => {
    it('synchronously collapses completed groups on their first frame', () => {
        expect([...resolveCollapsedGroupIds([completed], null, 'session-1')]).toEqual(['completed']);
    });

    it('keeps pending and running groups expanded by default', () => {
        expect(resolveCollapsedGroupIds([pending, running], null, 'session-1').size).toBe(0);
    });

    it('honors explicit manual expansion and collapsing', () => {
        const overrides: GroupCollapseOverrides = {
            sessionId: 'session-1',
            values: new Map([['completed', false], ['pending', true]]),
        };

        expect([...resolveCollapsedGroupIds([completed, pending], overrides, 'session-1')]).toEqual(['pending']);
    });

    it('drops page-local overrides when the session changes', () => {
        const overrides: GroupCollapseOverrides = {
            sessionId: 'session-1',
            values: new Map([['completed', false]]),
        };

        expect([...resolveCollapsedGroupIds([completed], overrides, 'session-2')]).toEqual(['completed']);
    });
});
