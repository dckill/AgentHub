import { describe, expect, it, vi } from 'vitest';
import { handleEphemeralRealtime } from './ephemeralRealtimeHandler';

describe('handleEphemeralRealtime', () => {
    it('drops updates from an old account generation before parsing', () => {
        const parseUpdate = vi.fn();

        handleEphemeralRealtime({
            update: {},
            isCurrent: () => false,
            parseUpdate,
            addActivity: vi.fn(),
            getMachine: vi.fn(),
            applyMachine: vi.fn(),
            invalidateMachines: vi.fn(),
            applySessionUsage: vi.fn(),
            applySessionControl: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        });

        expect(parseUpdate).not.toHaveBeenCalled();
    });

    it('logs malformed updates and does not dispatch them', () => {
        const warn = vi.fn();
        const error = vi.fn();

        handleEphemeralRealtime({
            update: { bad: true },
            isCurrent: () => true,
            parseUpdate: () => null,
            addActivity: vi.fn(),
            getMachine: vi.fn(),
            applyMachine: vi.fn(),
            invalidateMachines: vi.fn(),
            applySessionUsage: vi.fn(),
            applySessionControl: vi.fn(),
            warn,
            error,
        });

        expect(warn).toHaveBeenCalledWith('Invalid ephemeral update received');
        expect(error).toHaveBeenCalledWith('Invalid ephemeral update received:', { bad: true });
    });

    it('accumulates activity and applies usage and session-control updates', () => {
        const addActivity = vi.fn();
        const applySessionUsage = vi.fn();
        const applySessionControl = vi.fn();
        const updates = [
            { type: 'activity', id: 'session-1', active: true, activeAt: 10, thinking: false },
            {
                type: 'usage',
                id: 'session-1',
                key: 'codex',
                timestamp: 11,
                tokens: { total: 7, input: 3, output: 4 },
                cost: { total: 0 },
            },
            {
                type: 'session-control',
                sessionId: 'session-1',
                activeDeviceId: 'device-1',
                activeDeviceAt: 12,
            },
        ] as const;

        for (const update of updates) {
            handleEphemeralRealtime({
                update,
                isCurrent: () => true,
                parseUpdate: (value) => value as never,
                addActivity,
                getMachine: vi.fn(),
                applyMachine: vi.fn(),
                invalidateMachines: vi.fn(),
                applySessionUsage,
                applySessionControl,
                warn: vi.fn(),
                error: vi.fn(),
            });
        }

        expect(addActivity).toHaveBeenCalledWith(updates[0]);
        expect(applySessionUsage).toHaveBeenCalledWith('session-1', expect.objectContaining({
            inputTokens: 3,
            outputTokens: 4,
            contextSize: 3,
            timestamp: 11,
        }));
        expect(applySessionControl).toHaveBeenCalledWith(updates[2]);
    });

    it('invalidates machines when machine activity targets an unknown machine', () => {
        const invalidateMachines = vi.fn();
        const error = vi.fn();
        const update = { type: 'machine-activity', id: 'machine-1', active: true, activeAt: 13 };

        handleEphemeralRealtime({
            update,
            isCurrent: () => true,
            parseUpdate: (value) => value as never,
            addActivity: vi.fn(),
            getMachine: () => undefined,
            applyMachine: vi.fn(),
            invalidateMachines,
            applySessionUsage: vi.fn(),
            applySessionControl: vi.fn(),
            warn: vi.fn(),
            error,
        });

        expect(error).toHaveBeenCalledWith('Machine machine-1 not found for realtime activity update');
        expect(invalidateMachines).toHaveBeenCalledOnce();
    });
});
