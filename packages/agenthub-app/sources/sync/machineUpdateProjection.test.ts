import { describe, expect, it } from 'vitest';
import type { Machine } from './storageTypes';
import { buildMachineUpdateProjection } from './machineUpdateProjection';

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

describe('buildMachineUpdateProjection', () => {
    it('preserves activity fields for metadata-only updates', () => {
        expect(buildMachineUpdateProjection(
            'machine-1',
            existing,
            { t: 'update-machine', machineId: 'machine-1', metadata: { version: 3, value: 'encrypted' } },
            5,
            30,
        )).toMatchObject({
            id: 'machine-1',
            seq: 5,
            createdAt: 10,
            updatedAt: 30,
            active: false,
            activeAt: 12,
            metadataVersion: 2,
            daemonStateVersion: 3,
        });
    });

    it('uses update activity fields when they are explicitly supplied', () => {
        expect(buildMachineUpdateProjection(
            'machine-1',
            existing,
            { t: 'update-machine', machineId: 'machine-1', active: true, activeAt: 40 },
            6,
            40,
        )).toMatchObject({ active: true, activeAt: 40, seq: 6 });
    });
});
