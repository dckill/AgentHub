import { describe, expect, it } from 'vitest';
import { reconcileMachineSnapshot } from './machineSnapshot';
import type { Machine } from './storageTypes';

function machine(id: string, overrides: Partial<Machine> = {}): Machine {
    return {
        id,
        seq: 1,
        metadata: {
            host: 'devbox',
            platform: 'linux',
            homeDir: '/home/dev',
            agentHubHomeDir: '/home/dev/.agenthub',
            agentHubCliVersion: '1.1.2',
        },
        metadataVersion: 1,
        daemonState: null,
        daemonStateVersion: 1,
        active: true,
        activeAt: 10,
        createdAt: 1,
        updatedAt: 10,
        ...overrides,
    };
}

describe('reconcileMachineSnapshot', () => {
    it('keeps machines when an empty response or decryption failure is transient', () => {
        const existing = machine('machine-1');
        expect(reconcileMachineSnapshot({
            rawMachineIds: [], decryptedMachines: [], failedMachineIds: [], existingMachines: { 'machine-1': existing },
        })).toEqual([existing]);
        expect(reconcileMachineSnapshot({
            rawMachineIds: ['machine-1'], decryptedMachines: [], failedMachineIds: ['machine-1'], existingMachines: { 'machine-1': existing },
        })).toEqual([existing]);
    });

    it('keeps newer realtime presence over an older REST snapshot', () => {
        const existing = machine('machine-1', { active: true, activeAt: 50, seq: 5, updatedAt: 50 });
        const stale = machine('machine-1', { active: false, activeAt: 40, seq: 4, updatedAt: 40 });
        const [result] = reconcileMachineSnapshot({
            rawMachineIds: ['machine-1'], decryptedMachines: [stale], failedMachineIds: [], existingMachines: { 'machine-1': existing },
        });
        expect(result).toMatchObject({ active: true, activeAt: 50, seq: 5, updatedAt: 50 });
    });
});
