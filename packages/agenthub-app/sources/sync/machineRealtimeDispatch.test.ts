import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdateContainer } from './apiTypes';
import {
    dispatchMachineRealtimeUpdate,
    type MachineRealtimeDispatchContext,
} from './machineRealtimeDispatch';

const context = (): MachineRealtimeDispatchContext => ({
    getMachine: vi.fn(),
    decryptDataEncryptionKey: vi.fn(),
    storeDataKey: vi.fn(),
    initializeMachines: vi.fn(),
    getMachineEncryption: vi.fn(),
    assertCurrent: vi.fn(),
    invalidateMachines: vi.fn(),
    applyMachine: vi.fn(),
    hasMachine: vi.fn(() => true),
    deleteMachine: vi.fn(),
    removeMachineEncryption: vi.fn(),
    deleteDataKey: vi.fn(),
    log: vi.fn(),
    logError: vi.fn(),
});

const envelope = (body: ApiUpdateContainer['body']): ApiUpdateContainer => ({
    id: 'update-1',
    seq: 7,
    createdAt: 100,
    body,
});

describe('machine realtime dispatch', () => {
    it('routes new, update, and delete machine envelopes with the current snapshot', async () => {
        const params = context();
        const newHandler = vi.fn(async () => undefined);
        const updateHandler = vi.fn(async () => undefined);
        const deleteHandler = vi.fn();

        await expect(dispatchMachineRealtimeUpdate(envelope({
            t: 'new-machine',
            machineId: 'machine-1',
            seq: 2,
            metadata: 'metadata',
            metadataVersion: 1,
            daemonState: null,
            daemonStateVersion: 1,
            dataEncryptionKey: 'key',
            active: true,
            activeAt: 10,
            createdAt: 10,
            updatedAt: 20,
        }), { ...params, handleNewMachine: newHandler })).resolves.toBe(true);
        expect(newHandler).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ machineId: 'machine-1' }),
        }));

        await expect(dispatchMachineRealtimeUpdate(envelope({
            t: 'update-machine',
            machineId: 'machine-1',
            metadata: { value: 'metadata', version: 2 },
        }), { ...params, handleUpdateMachine: updateHandler })).resolves.toBe(true);
        expect(updateHandler).toHaveBeenCalledWith(expect.objectContaining({
            machineId: 'machine-1',
            seq: 7,
            createdAt: 100,
        }));

        await expect(dispatchMachineRealtimeUpdate(envelope({
            t: 'delete-machine',
            machineId: 'machine-1',
        }), { ...params, handleDeleteMachine: deleteHandler })).resolves.toBe(true);
        expect(deleteHandler).toHaveBeenCalledWith(expect.objectContaining({ machineId: 'machine-1' }));
    });

    it('returns false without side effects for non-machine updates', async () => {
        const params = context();

        await expect(dispatchMachineRealtimeUpdate(envelope({
            t: 'delete-session',
            sid: 'session-1',
        }), params)).resolves.toBe(false);

        expect(params.applyMachine).not.toHaveBeenCalled();
        expect(params.deleteMachine).not.toHaveBeenCalled();
    });
});
