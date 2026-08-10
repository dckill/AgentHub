import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';
import { applyNewMachineUpdate } from './newMachineApplication';

const update: Extract<ApiUpdate, { t: 'new-machine' }> = {
    t: 'new-machine', machineId: 'machine-1', seq: 7, createdAt: 10, updatedAt: 20,
    active: true, activeAt: 18, metadataVersion: 2, metadata: 'metadata-cipher',
    daemonStateVersion: 3, daemonState: 'daemon-cipher', dataEncryptionKey: 'key-cipher',
};

const existing: Machine = {
    id: 'machine-1', seq: 6, createdAt: 5, updatedAt: 15, active: false, activeAt: 12,
    metadata: null, metadataVersion: 1, daemonState: null, daemonStateVersion: 1,
};

describe('applyNewMachineUpdate', () => {
    it('returns a refresh projection when the machine key cannot be decrypted', async () => {
        const initializeMachines = vi.fn();
        const result = await applyNewMachineUpdate({
            existing,
            update,
            decryptDataEncryptionKey: vi.fn().mockResolvedValue(null),
            storeDataKey: vi.fn(),
            initializeMachines,
            getMachineEncryption: vi.fn(),
            assertCurrent: vi.fn(),
        });

        expect(result).toMatchObject({ kind: 'refresh', reason: 'data-key', machine: { id: 'machine-1', seq: 7 } });
        expect(initializeMachines).not.toHaveBeenCalled();
    });

    it('initializes the key and applies encrypted fields as one result', async () => {
        const encryption = {
            decryptMetadata: vi.fn().mockResolvedValue({ host: 'new-host', platform: 'linux', agentHubCliVersion: '1' }),
            decryptDaemonState: vi.fn().mockResolvedValue({ status: 'online' }),
        };
        const storeDataKey = vi.fn();
        const initializeMachines = vi.fn().mockResolvedValue(undefined);
        const result = await applyNewMachineUpdate({
            existing,
            update,
            decryptDataEncryptionKey: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
            storeDataKey,
            initializeMachines,
            getMachineEncryption: vi.fn().mockReturnValue(encryption),
            assertCurrent: vi.fn(),
        });

        expect(result).toMatchObject({ kind: 'applied', machine: {
            id: 'machine-1', metadata: { host: 'new-host' }, daemonState: { status: 'online' },
        } });
        expect(storeDataKey).toHaveBeenCalledWith('machine-1', expect.any(Uint8Array));
        expect(initializeMachines).toHaveBeenCalledWith(new Map([['machine-1', expect.any(Uint8Array)]]));
    });
});
