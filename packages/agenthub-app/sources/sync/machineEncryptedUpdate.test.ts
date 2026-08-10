import { describe, expect, it, vi } from 'vitest';
import type { Machine } from './storageTypes';
import { applyMachineEncryptedUpdate } from './machineEncryptedUpdate';

const base: Machine = {
    id: 'machine-1',
    seq: 5,
    createdAt: 10,
    updatedAt: 30,
    active: false,
    activeAt: 12,
    metadata: null,
    metadataVersion: 2,
    daemonState: null,
    daemonStateVersion: 3,
};

describe('applyMachineEncryptedUpdate', () => {
    it('decrypts both fields and preserves their versions', async () => {
        const assertCurrent = vi.fn();
        const result = await applyMachineEncryptedUpdate({
            machine: base,
            update: {
                t: 'update-machine',
                machineId: 'machine-1',
                metadata: { version: 4, value: 'metadata-cipher' },
                daemonState: { version: 5, value: 'daemon-cipher' },
            },
            encryption: {
                decryptMetadata: vi.fn().mockResolvedValue({ host: 'new-host', platform: 'linux', agentHubCliVersion: '1' }),
                decryptDaemonState: vi.fn().mockResolvedValue({ status: 'running' }),
            },
            assertCurrent,
        });

        expect(result).toMatchObject({
            metadata: { host: 'new-host' },
            metadataVersion: 4,
            daemonState: { status: 'running' },
            daemonStateVersion: 5,
        });
        expect(assertCurrent).toHaveBeenCalledTimes(2);
    });

    it('keeps the other field when one decryption fails', async () => {
        const onError = vi.fn();
        const result = await applyMachineEncryptedUpdate({
            machine: base,
            update: {
                t: 'update-machine',
                machineId: 'machine-1',
                metadata: { version: 4, value: 'metadata-cipher' },
                daemonState: { version: 5, value: 'daemon-cipher' },
            },
            encryption: {
                decryptMetadata: vi.fn().mockRejectedValue(new Error('bad metadata')),
                decryptDaemonState: vi.fn().mockResolvedValue({ status: 'running' }),
            },
            assertCurrent: vi.fn(),
            onError,
        });

        expect(result.metadata).toBeNull();
        expect(result.daemonState).toEqual({ status: 'running' });
        expect(onError).toHaveBeenCalledWith('metadata', expect.any(Error));
    });

    it('does not swallow a lifecycle assertion failure', async () => {
        await expect(applyMachineEncryptedUpdate({
            machine: base,
            update: {
                t: 'update-machine',
                machineId: 'machine-1',
                metadata: { version: 4, value: 'metadata-cipher' },
            },
            encryption: {
                decryptMetadata: vi.fn().mockResolvedValue({ host: 'new-host' }),
                decryptDaemonState: vi.fn(),
            },
            assertCurrent: () => { throw new Error('stale generation'); },
        })).rejects.toThrow('stale generation');
    });
});
