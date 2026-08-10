import type { Machine } from './storageTypes';
import {
    applyMachineSnapshot,
    type MachineSnapshotApplicationResult,
    type MachineSnapshotApplyResult,
} from './machineSnapshotApplication';

export interface ApplyMachineSnapshotSyncOptions {
    result: MachineSnapshotApplicationResult | null;
    existingMachines: Record<string, Machine>;
    existingMachineIdsAtStart: string[];
    setDataKey: (machineId: string, key: Uint8Array) => void;
    applyMachines: (machines: Machine[], persist: boolean) => void;
    scheduleRetry: () => void;
    onIgnoredEmptySnapshot: () => void;
}

/** Apply a loaded machine snapshot while preserving retry and empty-snapshot semantics. */
export function applyMachineSnapshotSync(
    options: ApplyMachineSnapshotSyncOptions,
): MachineSnapshotApplyResult | null {
    if (!options.result) {
        return null;
    }

    for (const [machineId, key] of options.result.decryptedMachineKeys) {
        options.setDataKey(machineId, key);
    }

    const appliedSnapshot = applyMachineSnapshot({
        ...options.result,
        existingMachines: options.existingMachines,
        existingMachineIdsAtStart: options.existingMachineIdsAtStart,
    });
    if (appliedSnapshot.ignoredEmptySnapshot) {
        options.onIgnoredEmptySnapshot();
    }

    options.applyMachines(appliedSnapshot.reconciledMachines, true);
    if (appliedSnapshot.shouldRetry) {
        options.scheduleRetry();
    }

    return appliedSnapshot;
}
