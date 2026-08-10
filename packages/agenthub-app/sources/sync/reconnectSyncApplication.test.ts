import { describe, expect, it, vi } from 'vitest';
import { planReconnectSync, runReconnectSyncApplication } from './reconnectSyncApplication';

describe('planReconnectSync', () => {
    it('refreshes authoritative snapshots and retries pending sends for the current account', () => {
        expect(planReconnectSync(true)).toEqual({
            refreshSessions: true,
            refreshMachines: true,
            refreshArtifacts: true,
            retryPendingSends: true,
        });
    });

    it('drops a stale reconnect without scheduling any account work', () => {
        expect(planReconnectSync(false)).toEqual({
            refreshSessions: false,
            refreshMachines: false,
            refreshArtifacts: false,
            retryPendingSends: false,
        });
    });
});

describe('runReconnectSyncApplication', () => {
    it('does not invoke refresh or retry callbacks for a stale account', () => {
        const callbacks = {
            invalidateSessions: vi.fn(),
            invalidateMachines: vi.fn(),
            invalidateArtifacts: vi.fn(),
            retryPendingSends: vi.fn(),
        };

        expect(runReconnectSyncApplication({ isCurrentAccount: false, ...callbacks })).toBe(false);
        for (const callback of Object.values(callbacks)) {
            expect(callback).not.toHaveBeenCalled();
        }
    });

    it('refreshes authoritative resources before retrying pending sends', () => {
        const events: string[] = [];
        expect(runReconnectSyncApplication({
            isCurrentAccount: true,
            invalidateSessions: () => events.push('sessions'),
            invalidateMachines: () => events.push('machines'),
            invalidateArtifacts: () => events.push('artifacts'),
            retryPendingSends: () => events.push('sends'),
        })).toBe(true);
        expect(events).toEqual(['sessions', 'machines', 'artifacts', 'sends']);
    });
});
