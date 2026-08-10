import { describe, expect, it, vi } from 'vitest';
import { handleDeleteMachineRealtime } from './deleteMachineRealtimeHandler';

describe('handleDeleteMachineRealtime', () => {
    it('logs receipt, delegates cleanup, and logs stale resources when machine is missing', () => {
        const applyDelete = vi.fn();
        const log = vi.fn();

        handleDeleteMachineRealtime({
            machineId: 'machine-1',
            hasMachine: false,
            deleteMachine: vi.fn(),
            removeMachineEncryption: vi.fn(),
            deleteDataKey: vi.fn(),
            log,
            applyDelete,
        });

        expect(log).toHaveBeenNthCalledWith(1, '🗑️ Delete machine update received for machine-1');
        expect(log).toHaveBeenNthCalledWith(2, 'Machine machine-1 not in storage, clearing any stale resources');
        expect(applyDelete).toHaveBeenCalledWith('machine-1', expect.objectContaining({
            deleteMachine: expect.any(Function),
            removeMachineEncryption: expect.any(Function),
            deleteDataKey: expect.any(Function),
        }));
    });

    it('does not log stale resources when machine exists', () => {
        const log = vi.fn();

        handleDeleteMachineRealtime({
            machineId: 'machine-2',
            hasMachine: true,
            deleteMachine: vi.fn(),
            removeMachineEncryption: vi.fn(),
            deleteDataKey: vi.fn(),
            log,
        });

        expect(log).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith('🗑️ Delete machine update received for machine-2');
    });

    it('passes the canonical cleanup callbacks to the injected application', () => {
        const actions = {
            deleteMachine: vi.fn(),
            removeMachineEncryption: vi.fn(),
            deleteDataKey: vi.fn(),
        };
        const applyDelete = vi.fn();

        handleDeleteMachineRealtime({
            machineId: 'machine-3',
            hasMachine: true,
            ...actions,
            log: vi.fn(),
            applyDelete,
        });

        expect(applyDelete).toHaveBeenCalledWith('machine-3', actions);
    });
});
