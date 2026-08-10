import { applyMachineDeleteRealtimeUpdate } from './resourceDeleteRealtimeApplication';
import type { MachineDeleteCleanup } from './machineDeleteCleanup';

export type DeleteMachineRealtimeHandlerParams = MachineDeleteCleanup & {
    machineId: string;
    hasMachine: boolean;
    log: (message: string) => void;
    applyDelete?: (machineId: string, cleanup: MachineDeleteCleanup) => void;
};

/** Apply one realtime delete-machine envelope and own its diagnostic logs. */
export function handleDeleteMachineRealtime(
    params: DeleteMachineRealtimeHandlerParams,
): void {
    const applyDelete = params.applyDelete ?? applyMachineDeleteRealtimeUpdate;
    const {
        machineId,
        hasMachine,
        log,
        applyDelete: _injectedApplyDelete,
        ...cleanup
    } = params;

    log(`🗑️ Delete machine update received for ${machineId}`);
    if (!hasMachine) {
        log(`Machine ${machineId} not in storage, clearing any stale resources`);
    }
    applyDelete(machineId, cleanup);
}
