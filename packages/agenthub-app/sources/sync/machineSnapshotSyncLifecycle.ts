import type { AccountRequest } from './accountLifecycle';
import {
    decryptMachineSnapshot,
    type MachineSnapshotRecord,
} from './machineSnapshotApplication';
import { applyMachineSnapshotSync } from './machineSnapshotSyncApplication';
import type { Machine } from './storageTypes';

type MachineSnapshotEncryption = Parameters<typeof decryptMachineSnapshot>[0]['encryption'];

export interface MachineSnapshotSyncOptions {
    generation: number;
    assertCurrent: () => void;
    existingMachines: Record<string, Machine>;
    existingMachineIdsAtStart: string[];
    runRequest: <T>(
        generation: number,
        operation: (request: AccountRequest) => Promise<T>,
    ) => Promise<T>;
    fetchMachines: (signal: AbortSignal) => Promise<MachineSnapshotRecord[]>;
    encryption: MachineSnapshotEncryption;
    setDataKey: (machineId: string, key: Uint8Array) => void;
    applyMachines: (machines: Machine[], persist: boolean) => void;
    scheduleRetry: () => void;
    onIgnoredEmptySnapshot: () => void;
    log: (message: string) => void;
}

/** Fetch, decrypt, reconcile, and apply one authoritative machine snapshot. */
export async function runMachineSnapshotSync(
    options: MachineSnapshotSyncOptions,
): Promise<ReturnType<typeof applyMachineSnapshotSync>> {
    const result = await options.runRequest(options.generation, async (request) => {
        const machines = await options.fetchMachines(request.signal);
        request.assertCurrent();
        return decryptMachineSnapshot({ machines, encryption: options.encryption, request });
    });
    options.assertCurrent();

    const appliedSnapshot = applyMachineSnapshotSync({
        result,
        existingMachines: options.existingMachines,
        existingMachineIdsAtStart: options.existingMachineIdsAtStart,
        setDataKey: options.setDataKey,
        applyMachines: options.applyMachines,
        scheduleRetry: options.scheduleRetry,
        onIgnoredEmptySnapshot: options.onIgnoredEmptySnapshot,
    });
    if (!appliedSnapshot || !result) {
        return appliedSnapshot;
    }

    options.log(
        `🖥️ fetchMachines completed - received ${result.rawMachineIds.length}, processed ${result.decryptedMachines.length}, retained ${appliedSnapshot.reconciledMachines.length} machines`,
    );
    return appliedSnapshot;
}
