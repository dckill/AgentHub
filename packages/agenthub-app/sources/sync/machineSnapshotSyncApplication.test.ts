import { describe, expect, it, vi } from 'vitest';
import { applyMachineSnapshotSync } from './machineSnapshotSyncApplication';
import type { MachineSnapshotApplicationResult } from './machineSnapshotApplication';
import type { Machine } from './storageTypes';

const machine = (id: string): Machine => ({ id } as Machine);

const result = (overrides: Partial<MachineSnapshotApplicationResult> = {}): MachineSnapshotApplicationResult => ({
    rawMachineIds: ['machine-1', 'machine-2'],
    decryptedMachines: [machine('machine-1')],
    decryptedMachineKeys: new Map([['machine-1', Uint8Array.from([1, 2, 3])]]),
    failedMachineIds: ['machine-2'],
    ...overrides,
});

describe('applyMachineSnapshotSync', () => {
    it('stores keys, applies a reconciled snapshot, and schedules retry for failed machines', () => {
        const setDataKey = vi.fn();
        const applyMachines = vi.fn();
        const scheduleRetry = vi.fn();

        const applied = applyMachineSnapshotSync({
            result: result(),
            existingMachines: { 'machine-2': machine('machine-2') },
            existingMachineIdsAtStart: ['machine-2'],
            setDataKey,
            applyMachines,
            scheduleRetry,
            onIgnoredEmptySnapshot: vi.fn(),
        });

        expect(setDataKey).toHaveBeenCalledWith('machine-1', Uint8Array.from([1, 2, 3]));
        expect(applyMachines).toHaveBeenCalledWith(
            expect.arrayContaining([machine('machine-1'), machine('machine-2')]),
            true,
        );
        expect(scheduleRetry).toHaveBeenCalledOnce();
        expect(applied?.shouldRetry).toBe(true);
    });

    it('keeps an existing list when the server returns an empty snapshot', () => {
        const onIgnoredEmptySnapshot = vi.fn();
        const applyMachines = vi.fn();

        const applied = applyMachineSnapshotSync({
            result: result({ rawMachineIds: [], decryptedMachines: [], failedMachineIds: [], decryptedMachineKeys: new Map() }),
            existingMachines: { 'machine-1': machine('machine-1') },
            existingMachineIdsAtStart: ['machine-1'],
            setDataKey: vi.fn(),
            applyMachines,
            scheduleRetry: vi.fn(),
            onIgnoredEmptySnapshot,
        });

        expect(onIgnoredEmptySnapshot).toHaveBeenCalledOnce();
        expect(applyMachines).toHaveBeenCalledWith([machine('machine-1')], true);
        expect(applied?.ignoredEmptySnapshot).toBe(true);
    });

    it('does nothing when account lifecycle produced no result', () => {
        const applyMachines = vi.fn();

        expect(applyMachineSnapshotSync({
            result: null,
            existingMachines: {},
            existingMachineIdsAtStart: [],
            setDataKey: vi.fn(),
            applyMachines,
            scheduleRetry: vi.fn(),
            onIgnoredEmptySnapshot: vi.fn(),
        })).toBeNull();
        expect(applyMachines).not.toHaveBeenCalled();
    });
});
