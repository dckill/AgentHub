import type { Machine } from './storageTypes';

type MachineSnapshotInput = {
    rawMachineIds: string[];
    decryptedMachines: Machine[];
    failedMachineIds: string[];
    existingMachines: Record<string, Machine>;
    existingMachineIdsAtStart?: string[];
};

function mergeWithNewerLocalPresence(existing: Machine | undefined, incoming: Machine): Machine {
    if (!existing || existing.activeAt <= incoming.activeAt) return incoming;
    return {
        ...incoming,
        seq: Math.max(existing.seq, incoming.seq),
        updatedAt: Math.max(existing.updatedAt, incoming.updatedAt),
        active: existing.active,
        activeAt: existing.activeAt,
    };
}

export function reconcileMachineSnapshot(input: MachineSnapshotInput): Machine[] {
    if (input.rawMachineIds.length === 0 && Object.keys(input.existingMachines).length > 0) {
        return Object.values(input.existingMachines);
    }

    const decryptedById = new Map(input.decryptedMachines.map((machine) => [machine.id, machine]));
    const failedIds = new Set(input.failedMachineIds);
    const reconciled: Machine[] = [];
    for (const machineId of input.rawMachineIds) {
        const existing = input.existingMachines[machineId];
        if (failedIds.has(machineId) && existing) {
            reconciled.push(existing);
            continue;
        }
        const decrypted = decryptedById.get(machineId);
        if (decrypted) reconciled.push(mergeWithNewerLocalPresence(existing, decrypted));
        else if (existing) reconciled.push(existing);
    }

    const idsAtStart = new Set(input.existingMachineIdsAtStart ?? Object.keys(input.existingMachines));
    for (const existing of Object.values(input.existingMachines)) {
        if (!idsAtStart.has(existing.id) && !decryptedById.has(existing.id)) reconciled.push(existing);
    }
    return reconciled;
}
