import { describe, expect, it, vi } from 'vitest';
import type { Machine } from './storageTypes';
import { applyMachineUpdate } from './machineUpdateApplication';

const existing: Machine = {
    id: 'machine-1',
    seq: 4,
    createdAt: 10,
    updatedAt: 20,
    active: false,
    activeAt: 12,
    metadata: null,
    metadataVersion: 2,
    daemonState: null,
    daemonStateVersion: 3,
};

describe('applyMachineUpdate', () => {
    it('reports a missing machine without attempting decryption', async () => {
        const encryption = {
            decryptMetadata: vi.fn(),
            decryptDaemonState: vi.fn(),
        };

        await expect(applyMachineUpdate({
            machineId: 'machine-1',
            existing: undefined,
            update: { t: 'update-machine', machineId: 'machine-1' },
            seq: 5,
            createdAt: 30,
            encryption,
            assertCurrent: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-machine', machineId: 'machine-1' });
        expect(encryption.decryptMetadata).not.toHaveBeenCalled();
    });

    it('reports missing encryption before applying an update', async () => {
        await expect(applyMachineUpdate({
            machineId: 'machine-1',
            existing,
            update: { t: 'update-machine', machineId: 'machine-1' },
            seq: 5,
            createdAt: 30,
            encryption: null,
            assertCurrent: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-encryption', machineId: 'machine-1' });
    });

    it('projects and decrypts an update as one application result', async () => {
        const machine = await applyMachineUpdate({
            machineId: 'machine-1',
            existing,
            update: {
                t: 'update-machine',
                machineId: 'machine-1',
                metadata: { version: 4, value: 'metadata-cipher' },
            },
            seq: 5,
            createdAt: 30,
            encryption: {
                decryptMetadata: vi.fn().mockResolvedValue({ host: 'new-host', platform: 'linux', agentHubCliVersion: '1' }),
                decryptDaemonState: vi.fn(),
            },
            assertCurrent: vi.fn(),
        });

        expect(machine).toMatchObject({
            kind: 'applied',
            machine: {
                id: 'machine-1',
                seq: 5,
                updatedAt: 30,
                metadata: { host: 'new-host' },
                metadataVersion: 4,
            },
        });
    });
});
