import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';
import { applyNewMachineUpdate } from './newMachineApplication';

type NewMachineUpdate = Extract<ApiUpdate, { t: 'new-machine' }>;
type NewMachineUpdateParams = Parameters<typeof applyNewMachineUpdate>[0];
type NewMachineApplicationResult = Awaited<ReturnType<typeof applyNewMachineUpdate>>;

export type NewMachineRealtimeHandlerParams = Omit<NewMachineUpdateParams, 'onError'> & {
    invalidateMachines: () => void;
    applyMachine: (machine: Machine) => void;
    logError: (message: string, error?: unknown) => void;
    applyUpdate?: (params: NewMachineUpdateParams) => Promise<NewMachineApplicationResult>;
};

/** Apply one realtime new-machine envelope and own refreshable side effects. */
export async function handleNewMachineRealtime(
    params: NewMachineRealtimeHandlerParams,
): Promise<void> {
    const machineId = params.update.machineId;
    const applyUpdate = params.applyUpdate ?? applyNewMachineUpdate;
    const newMachineResult = await applyUpdate({
        existing: params.existing,
        update: params.update,
        decryptDataEncryptionKey: params.decryptDataEncryptionKey,
        storeDataKey: params.storeDataKey,
        initializeMachines: params.initializeMachines,
        getMachineEncryption: params.getMachineEncryption,
        assertCurrent: params.assertCurrent,
        onError: (field, error) => {
            params.assertCurrent();
            params.logError(`Failed to decrypt new machine ${field} for ${machineId}:`, error);
            params.invalidateMachines();
        },
    });

    if (newMachineResult.kind === 'refresh') {
        if (newMachineResult.reason === 'data-key') {
            params.logError(`Failed to decrypt data encryption key for new machine ${machineId}`);
        } else {
            params.logError(`Machine encryption not found for ${machineId} after new-machine initialization`);
        }
        params.applyMachine(newMachineResult.machine);
        params.invalidateMachines();
        return;
    }

    params.applyMachine(newMachineResult.machine);
}
