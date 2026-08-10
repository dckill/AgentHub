import { describe, expect, it } from 'vitest';
import type { Machine } from './storageTypes';
import { buildMachineActivityProjection } from './machineActivityProjection';

const machine: Machine = {
    id: 'machine-1',
    seq: 4,
    createdAt: 10,
    updatedAt: 20,
    active: false,
    activeAt: 15,
    metadata: {
        host: 'host',
        platform: 'linux',
        agentHubCliVersion: '1.0.0',
        agentHubHomeDir: '/tmp/agenthub',
        homeDir: '/home/user',
    },
    metadataVersion: 2,
    daemonState: { status: 'ready' },
    daemonStateVersion: 3,
};

describe('buildMachineActivityProjection', () => {
    it('updates only volatile activity fields', () => {
        expect(buildMachineActivityProjection(machine, {
            id: 'machine-1',
            active: true,
            activeAt: 30,
        })).toEqual({
            ...machine,
            active: true,
            activeAt: 30,
        });
    });
});
