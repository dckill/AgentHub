import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';

type MachineUpdate = Extract<ApiUpdate, { t: 'update-machine' }>;

/** Build the non-encrypted portion of a machine update projection. */
export function buildMachineUpdateProjection(
    machineId: string,
    existing: Machine | undefined,
    machineUpdate: MachineUpdate,
    seq: number,
    createdAt: number,
): Machine {
    return {
        id: machineId,
        seq,
        createdAt: existing?.createdAt ?? createdAt,
        updatedAt: createdAt,
        active: machineUpdate.active ?? existing?.active ?? true,
        activeAt: machineUpdate.activeAt ?? existing?.activeAt ?? createdAt,
        metadata: existing?.metadata ?? null,
        metadataVersion: existing?.metadataVersion ?? 0,
        daemonState: existing?.daemonState ?? null,
        daemonStateVersion: existing?.daemonStateVersion ?? 0,
    };
}
