import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';
import { applyNewMachineEncryptedUpdate } from './newMachineEncryptedUpdate';

const machine: Machine = {
    id: 'machine-1', seq: 4, createdAt: 1, updatedAt: 2, active: true, activeAt: 2,
    metadata: {
        host: 'machine', platform: 'linux', agentHubCliVersion: '1.0.0',
        agentHubHomeDir: '/home/user/.agenthub', homeDir: '/home/user',
    }, metadataVersion: 3,
    daemonState: { status: 'online' }, daemonStateVersion: 5,
};

const update: Extract<ApiUpdate, { t: 'new-machine' }> = {
    t: 'new-machine', machineId: machine.id, seq: 6, metadata: 'bad-metadata', metadataVersion: 7,
    daemonState: 'bad-daemon', daemonStateVersion: 8, dataEncryptionKey: null,
    active: true, activeAt: 6, createdAt: 1, updatedAt: 6,
};

describe('applyNewMachineEncryptedUpdate', () => {
    it('preserves existing encrypted fields when either decryptor returns null', async () => {
        const updated = await applyNewMachineEncryptedUpdate({
            machine,
            update,
            encryption: {
                decryptMetadata: vi.fn(async () => null),
                decryptDaemonState: vi.fn(async () => null),
            },
            assertCurrent: vi.fn(),
        });

        expect(updated.metadata).toEqual(machine.metadata);
        expect(updated.metadataVersion).toBe(machine.metadataVersion);
        expect(updated.daemonState).toEqual(machine.daemonState);
        expect(updated.daemonStateVersion).toBe(machine.daemonStateVersion);
    });

    it('applies a valid field independently when the other field fails', async () => {
        const onError = vi.fn();
        const updated = await applyNewMachineEncryptedUpdate({
            machine,
            update,
            encryption: {
                decryptMetadata: vi.fn(async () => ({
                    host: 'machine', platform: 'linux', agentHubCliVersion: '1.1.0',
                    agentHubHomeDir: '/home/user/.agenthub', homeDir: '/home/user',
                })),
                decryptDaemonState: vi.fn(async () => { throw new Error('invalid daemon state'); }),
            },
            assertCurrent: vi.fn(),
            onError,
        });

        expect(updated.metadata).toEqual({
            host: 'machine', platform: 'linux', agentHubCliVersion: '1.1.0',
            agentHubHomeDir: '/home/user/.agenthub', homeDir: '/home/user',
        });
        expect(updated.metadataVersion).toBe(7);
        expect(updated.daemonState).toEqual(machine.daemonState);
        expect(updated.daemonStateVersion).toBe(machine.daemonStateVersion);
        expect(onError).toHaveBeenCalledWith('daemonState', expect.any(Error));
    });
});
