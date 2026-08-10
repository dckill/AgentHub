import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';
import { applyMachineUpdate } from './machineUpdateApplication';

type MachineUpdate = Extract<ApiUpdate, { t: 'update-machine' }>;
type MachineUpdateParams = Parameters<typeof applyMachineUpdate>[0];
type MachineUpdateApplicationResult = Awaited<ReturnType<typeof applyMachineUpdate>>;

export type UpdateMachineRealtimeHandlerParams = Omit<MachineUpdateParams, 'onError'> & {
    invalidateMachines: () => void;
    applyMachine: (machine: Machine) => void;
    logError: (message: string, error?: unknown) => void;
    applyUpdate?: (params: MachineUpdateParams) => Promise<MachineUpdateApplicationResult>;
};

/** Apply one realtime update-machine envelope and own refreshable side effects. */
export async function handleUpdateMachineRealtime(
    params: UpdateMachineRealtimeHandlerParams,
): Promise<void> {
    const machineId = params.machineId;
    const applyUpdate = params.applyUpdate ?? applyMachineUpdate;
    const machineUpdateResult = await applyUpdate({
        machineId,
        existing: params.existing,
        update: params.update,
        seq: params.seq,
        createdAt: params.createdAt,
        encryption: params.encryption,
        assertCurrent: params.assertCurrent,
        onError: (field, error) => {
            params.assertCurrent();
            params.logError(`Failed to decrypt machine ${field} for ${machineId}:`, error);
            params.invalidateMachines();
        },
    });

    if (machineUpdateResult.kind === 'missing-machine') {
        params.logError(`Machine ${machineId} not found for realtime update`);
        params.invalidateMachines();
        return;
    }
    if (machineUpdateResult.kind === 'missing-encryption') {
        params.logError(`Machine encryption not found for ${machineId} - cannot decrypt updates`);
        params.invalidateMachines();
        return;
    }

    params.applyMachine(machineUpdateResult.machine);
}
