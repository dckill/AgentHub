import { describe, expect, it, vi } from 'vitest';

import { createSyncEphemeralUpdateContext } from './syncEphemeralUpdateContext';

describe('createSyncEphemeralUpdateContext', () => {
    it('binds one account generation while preserving every ephemeral callback', () => {
        const isCurrent = vi.fn((generation: number) => generation === 42);
        const callbacks = {
            addActivity: vi.fn(),
            getMachine: vi.fn(),
            applyMachine: vi.fn(),
            invalidateMachines: vi.fn(),
            applySessionUsage: vi.fn(),
            applySessionControl: vi.fn(),
            warn: vi.fn(),
            error: vi.fn(),
        };

        const context = createSyncEphemeralUpdateContext({
            generation: 42,
            isCurrent,
            ...callbacks,
        });

        expect(context.isCurrent(999)).toBe(true);
        expect(isCurrent).toHaveBeenCalledTimes(1);
        expect(isCurrent).toHaveBeenCalledWith(42);
        expect(context.addActivity).toBe(callbacks.addActivity);
        expect(context.getMachine).toBe(callbacks.getMachine);
        expect(context.applyMachine).toBe(callbacks.applyMachine);
        expect(context.invalidateMachines).toBe(callbacks.invalidateMachines);
        expect(context.applySessionUsage).toBe(callbacks.applySessionUsage);
        expect(context.applySessionControl).toBe(callbacks.applySessionControl);
        expect(context.warn).toBe(callbacks.warn);
        expect(context.error).toBe(callbacks.error);
    });
});
