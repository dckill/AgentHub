import { describe, expect, it, vi } from 'vitest';
import {
    dispatchEphemeralRealtimeUpdate,
    type EphemeralRealtimeDispatchContext,
} from './ephemeralRealtimeDispatch';

const context = (): EphemeralRealtimeDispatchContext => ({
    isCurrent: vi.fn(),
    addActivity: vi.fn(),
    getMachine: vi.fn(),
    applyMachine: vi.fn(),
    invalidateMachines: vi.fn(),
    applySessionUsage: vi.fn(),
    applySessionControl: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
});

describe('ephemeral realtime dispatch', () => {
    it('passes the generation guard and all store callbacks to the handler', () => {
        const params = context();
        const handler = vi.fn();

        dispatchEphemeralRealtimeUpdate({ type: 'activity', id: 'session-1' }, 9, {
            ...params,
            handleEphemeral: handler,
            isCurrent: vi.fn((generation) => generation === 9),
        });

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            update: { type: 'activity', id: 'session-1' },
            isCurrent: expect.any(Function),
            addActivity: params.addActivity,
            applySessionControl: params.applySessionControl,
        }));
        const received = handler.mock.calls[0]?.[0] as { isCurrent: () => boolean };
        expect(received.isCurrent()).toBe(true);
    });

    it('passes a stale generation as false so the handler can fail closed', () => {
        const params = context();
        const handler = vi.fn();

        dispatchEphemeralRealtimeUpdate({ type: 'usage', id: 'session-1' }, 8, {
            ...params,
            handleEphemeral: handler,
            isCurrent: vi.fn(() => false),
        });

        expect(handler).toHaveBeenCalledOnce();
        const received = handler.mock.calls[0]?.[0] as { isCurrent: () => boolean };
        expect(received.isCurrent()).toBe(false);
    });
});
