import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';

type NewMachineUpdate = Extract<ApiUpdate, { t: 'new-machine' }>;

/** Build the non-encrypted portion shared by new-machine success and recovery paths. */
export function buildNewMachineProjection(
    existing: Machine | undefined,
    update: NewMachineUpdate,
): Machine {
    return {
        id: update.machineId,
        seq: update.seq,
        createdAt: existing?.createdAt ?? update.createdAt,
        updatedAt: update.updatedAt,
        active: update.active,
        activeAt: update.activeAt,
        metadata: existing?.metadata ?? null,
        metadataVersion: update.metadataVersion,
        daemonState: existing?.daemonState ?? null,
        daemonStateVersion: update.daemonStateVersion,
    };
}
