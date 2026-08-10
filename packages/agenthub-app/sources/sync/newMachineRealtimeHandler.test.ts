import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';
import { handleNewMachineRealtime } from './newMachineRealtimeHandler';

type NewMachineUpdate = Extract<ApiUpdate, { t: 'new-machine' }>;

const update: NewMachineUpdate = {
    t: 'new-machine', machineId: 'machine-1', seq: 7, createdAt: 10, updatedAt: 20,
    active: true, activeAt: 18, metadataVersion: 2, metadata: 'metadata-cipher',
    daemonStateVersion: 3, daemonState: 'daemon-cipher', dataEncryptionKey: 'key-cipher',
};
const machine: Machine = {
    id: 'machine-1', seq: 7, createdAt: 10, updatedAt: 20, active: true, activeAt: 18,
    metadata: null, metadataVersion: 2, daemonState: null, daemonStateVersion: 3,
};

function createParams(overrides: Record<string, unknown> = {}) {
    return {
        existing: undefined,
        update,
        decryptDataEncryptionKey: vi.fn(),
        storeDataKey: vi.fn(),
        initializeMachines: vi.fn(),
        getMachineEncryption: vi.fn(),
        assertCurrent: vi.fn(),
        invalidateMachines: vi.fn(),
        applyMachine: vi.fn(),
        logError: vi.fn(),
        applyUpdate: vi.fn().mockResolvedValue({ kind: 'applied', machine }),
        ...overrides,
    };
}

describe('handleNewMachineRealtime', () => {
    it('applies a successful machine without invalidating the snapshot', async () => {
        const params = createParams();

        await handleNewMachineRealtime(params);

        expect(params.applyMachine).toHaveBeenCalledWith(machine);
        expect(params.invalidateMachines).not.toHaveBeenCalled();
    });

    it.each([
        ['data-key', 'Failed to decrypt data encryption key for new machine machine-1'],
        ['encryption', 'Machine encryption not found for machine-1 after new-machine initialization'],
    ] as const)('keeps the projected machine and refreshes for %s failures', async (reason, expectedLog) => {
        const params = createParams({
            applyUpdate: vi.fn().mockResolvedValue({ kind: 'refresh', reason, machine }),
        });

        await handleNewMachineRealtime(params);

        expect(params.applyMachine).toHaveBeenCalledWith(machine);
        expect(params.invalidateMachines).toHaveBeenCalledOnce();
        expect(params.logError).toHaveBeenCalledWith(expectedLog);
    });

    it('re-checks the account and refreshes when encrypted fields fail', async () => {
        const params = createParams({
            applyUpdate: vi.fn().mockImplementation(async (input) => {
                input.onError('metadata', new Error('metadata failed'));
                return { kind: 'applied', machine };
            }),
        });

        await handleNewMachineRealtime(params);

        expect(params.assertCurrent).toHaveBeenCalledOnce();
        expect(params.invalidateMachines).toHaveBeenCalledOnce();
        expect(params.logError).toHaveBeenCalledWith('Failed to decrypt new machine metadata for machine-1:', expect.any(Error));
    });
});
