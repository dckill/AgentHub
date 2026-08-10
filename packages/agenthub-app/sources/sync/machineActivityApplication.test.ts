import { describe, expect, it } from 'vitest';
import type { Machine } from './storageTypes';
import { applyMachineActivityUpdate } from './machineActivityApplication';

const machine: Machine = {
    id: 'machine-1',
    seq: 4,
    createdAt: 1,
    updatedAt: 2,
    active: false,
    activeAt: 10,
    metadata: null,
    metadataVersion: 3,
    daemonState: { status: 'idle' },
    daemonStateVersion: 5,
};

describe('applyMachineActivityUpdate', () => {
    it('classifies a missing machine as refreshable', () => {
        expect(applyMachineActivityUpdate(undefined, {
            id: 'machine-1',
            active: true,
            activeAt: 20,
        })).toEqual({ kind: 'missing' });
    });

    it('updates only volatile activity fields on a known machine', () => {
        expect(applyMachineActivityUpdate(machine, {
            id: 'machine-1',
            active: true,
            activeAt: 20,
        })).toEqual({
            kind: 'updated',
            machine: { ...machine, active: true, activeAt: 20 },
        });
    });
});
