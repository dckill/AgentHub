import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';
import { handleUpdateMachineRealtime } from './updateMachineRealtimeHandler';

type MachineUpdate = Extract<ApiUpdate, { t: 'update-machine' }>;

const update: MachineUpdate = {
    t: 'update-machine', machineId: 'machine-1',
    metadata: { value: 'metadata', version: 2 },
    daemonState: { value: 'daemon', version: 2 },
    active: true, activeAt: 2,
};
const machine: Machine = {
    id: 'machine-1', seq: 3, createdAt: 1, updatedAt: 2, active: true, activeAt: 2,
    metadata: null, metadataVersion: 2, daemonState: null, daemonStateVersion: 2,
};

function createParams(overrides: Record<string, unknown> = {}) {
    return {
        machineId: 'machine-1',
        existing: machine,
        update,
        seq: 3,
        createdAt: 2,
        encryption: {
            decryptMetadata: vi.fn(),
            decryptDaemonState: vi.fn(),
        },
        assertCurrent: vi.fn(),
        invalidateMachines: vi.fn(),
        applyMachine: vi.fn(),
        logError: vi.fn(),
        applyUpdate: vi.fn().mockResolvedValue({ kind: 'applied', machine }),
        ...overrides,
    };
}

describe('handleUpdateMachineRealtime', () => {
    it('applies a successful machine update without invalidating', async () => {
        const params = createParams();

        await handleUpdateMachineRealtime(params);

        expect(params.applyMachine).toHaveBeenCalledWith(machine);
        expect(params.invalidateMachines).not.toHaveBeenCalled();
    });

    it.each([
        ['missing-machine', 'Machine machine-1 not found for realtime update'],
        ['missing-encryption', 'Machine encryption not found for machine-1 - cannot decrypt updates'],
    ] as const)('refreshes machines for %s results', async (kind, expectedLog) => {
        const params = createParams({
            applyUpdate: vi.fn().mockResolvedValue({ kind, machineId: 'machine-1' }),
        });

        await handleUpdateMachineRealtime(params);

        expect(params.invalidateMachines).toHaveBeenCalledOnce();
        expect(params.applyMachine).not.toHaveBeenCalled();
        expect(params.logError).toHaveBeenCalledWith(expectedLog);
    });

    it('re-checks the account and invalidates when encrypted fields fail', async () => {
        const params = createParams({
            applyUpdate: vi.fn().mockImplementation(async (input) => {
                input.onError('daemonState', new Error('daemon failed'));
                return { kind: 'applied', machine };
            }),
        });

        await handleUpdateMachineRealtime(params);

        expect(params.assertCurrent).toHaveBeenCalledOnce();
        expect(params.invalidateMachines).toHaveBeenCalledOnce();
        expect(params.logError).toHaveBeenCalledWith('Failed to decrypt machine daemonState for machine-1:', expect.any(Error));
    });
});
