import { describe, expect, it, vi } from 'vitest';
import { applyMachineSnapshot, decryptMachineSnapshot, type MachineSnapshotRecord } from './machineSnapshotApplication';
import type { Machine } from './storageTypes';

const machine = (overrides: Partial<MachineSnapshotRecord> = {}): MachineSnapshotRecord => ({
    id: 'machine-1',
    metadata: 'encrypted-metadata',
    metadataVersion: 2,
    daemonState: 'encrypted-daemon-state',
    daemonStateVersion: 3,
    dataEncryptionKey: 'encrypted-key',
    seq: 7,
    active: true,
    activeAt: 40,
    createdAt: 10,
    updatedAt: 40,
    ...overrides,
});

describe('machine snapshot application', () => {
    it('decrypts keys and machine fields into a complete projection', async () => {
        const machineEncryption = {
            decryptMetadata: vi.fn().mockResolvedValue({
                host: 'host',
                platform: 'linux',
                agentHubCliVersion: '1.0.0',
                agentHubHomeDir: '/home/agenthub',
                homeDir: '/home/user',
            }),
            decryptDaemonState: vi.fn().mockResolvedValue({ status: 'running' }),
        };
        const encryption = {
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])),
            initializeMachines: vi.fn().mockResolvedValue(undefined),
            getMachineEncryption: vi.fn().mockReturnValue(machineEncryption),
        };
        const request = { assertCurrent: vi.fn(), signal: new AbortController().signal };

        const result = await decryptMachineSnapshot({
            machines: [machine()],
            encryption,
            request,
        });

        expect(encryption.initializeMachines).toHaveBeenCalledWith(expect.any(Map));
        expect(encryption.initializeMachines.mock.calls[0][0].get('machine-1')).toEqual(Uint8Array.from([1, 2, 3]));
        expect(result.decryptedMachineKeys.get('machine-1')).toEqual(Uint8Array.from([1, 2, 3]));
        expect(result.failedMachineIds).toEqual([]);
        expect(result.decryptedMachines).toEqual([expect.objectContaining({
            id: 'machine-1',
            metadata: expect.objectContaining({ host: 'host' }),
            daemonState: { status: 'running' },
        })]);
    });

    it('marks missing machine encryption as retryable instead of silently dropping it', async () => {
        const encryption = {
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([9])),
            initializeMachines: vi.fn().mockResolvedValue(undefined),
            getMachineEncryption: vi.fn().mockReturnValue(null),
        };
        const request = { assertCurrent: vi.fn(), signal: new AbortController().signal };

        const result = await decryptMachineSnapshot({
            machines: [machine({ id: 'locked' })],
            encryption,
            request,
        });

        expect(result.rawMachineIds).toEqual(['locked']);
        expect(result.decryptedMachines).toEqual([]);
        expect(result.decryptedMachineKeys.get('locked')).toEqual(Uint8Array.from([9]));
        expect(result.failedMachineIds).toEqual(['locked']);
    });
});

const projectedMachine = (id: string) => ({ id } as Machine);

describe('applyMachineSnapshot', () => {
    it('keeps the local projection and requests retry when a machine fails to decrypt', () => {
        const result = applyMachineSnapshot({
            rawMachineIds: ['machine-1', 'machine-2'],
            decryptedMachines: [projectedMachine('machine-1')],
            failedMachineIds: ['machine-2'],
            existingMachines: {
                'machine-1': projectedMachine('machine-1'),
                'machine-2': projectedMachine('machine-2'),
            },
            existingMachineIdsAtStart: ['machine-1', 'machine-2'],
        });

        expect(result.reconciledMachines.map((item) => item.id)).toEqual(['machine-1', 'machine-2']);
        expect(result.shouldRetry).toBe(true);
        expect(result.ignoredEmptySnapshot).toBe(false);
    });

    it('marks an unexpected empty snapshot without requesting a retry', () => {
        const result = applyMachineSnapshot({
            rawMachineIds: [],
            decryptedMachines: [],
            failedMachineIds: [],
            existingMachines: { 'machine-1': projectedMachine('machine-1') },
            existingMachineIdsAtStart: ['machine-1'],
        });

        expect(result.reconciledMachines.map((item) => item.id)).toEqual(['machine-1']);
        expect(result.shouldRetry).toBe(false);
        expect(result.ignoredEmptySnapshot).toBe(true);
    });

    it('does not request retry for a clean snapshot', () => {
        const result = applyMachineSnapshot({
            rawMachineIds: ['machine-1'],
            decryptedMachines: [projectedMachine('machine-1')],
            failedMachineIds: [],
            existingMachines: {},
            existingMachineIdsAtStart: [],
        });

        expect(result.shouldRetry).toBe(false);
        expect(result.ignoredEmptySnapshot).toBe(false);
    });
});
