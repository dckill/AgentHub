import { describe, expect, it } from 'vitest';
import { buildNewMachineProjection } from './newMachineProjection';
import type { Machine } from './storageTypes';

const update = {
    t: 'new-machine' as const,
    machineId: 'machine-1',
    seq: 7,
    createdAt: 100,
    updatedAt: 200,
    active: false,
    activeAt: 180,
    metadataVersion: 3,
    daemonStateVersion: 4,
    dataEncryptionKey: 'encrypted-key',
    metadata: 'encrypted-metadata',
    daemonState: 'encrypted-daemon-state',
};

const existing: Machine = {
    id: 'machine-1',
    seq: 6,
    createdAt: 50,
    updatedAt: 150,
    active: true,
    activeAt: 140,
    metadata: {
        host: 'old',
        platform: 'linux',
        agentHubCliVersion: '1.0.0',
        agentHubHomeDir: '/tmp/agenthub',
        homeDir: '/home/user',
    },
    metadataVersion: 2,
    daemonState: { status: 'ready' },
    daemonStateVersion: 2,
};

describe('buildNewMachineProjection', () => {
    it('preserves existing encrypted fields while replacing lifecycle fields', () => {
        expect(buildNewMachineProjection(existing, update)).toMatchObject({
            id: 'machine-1',
            seq: 7,
            createdAt: 50,
            updatedAt: 200,
            active: false,
            activeAt: 180,
            metadata: { host: 'old' },
            metadataVersion: 3,
            daemonState: { status: 'ready' },
            daemonStateVersion: 4,
        });
    });

    it('uses update creation time and null encrypted fields for a new machine', () => {
        expect(buildNewMachineProjection(undefined, update)).toMatchObject({
            createdAt: 100,
            metadata: null,
            daemonState: null,
            metadataVersion: 3,
            daemonStateVersion: 4,
        });
    });
});
