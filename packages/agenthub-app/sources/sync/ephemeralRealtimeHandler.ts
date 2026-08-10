import type {
    ApiEphemeralUpdate,
    ApiEphemeralActivityUpdate,
} from './apiTypes';
import type { Machine } from './storageTypes';
import { parseEphemeralUpdate } from './ephemeralUpdateParser';
import { buildEphemeralUpdateDispatch } from './ephemeralUpdateDispatch';
import { applyMachineActivityUpdate } from './machineActivityApplication';
import { buildLatestUsageFromEphemeral, type LatestSessionUsage } from './sessionUsage';

type MachineActivityUpdate = Extract<ApiEphemeralUpdate, { type: 'machine-activity' }>;
type SessionControlUpdate = Extract<ApiEphemeralUpdate, { type: 'session-control' }>;

export type EphemeralRealtimeHandlerParams = {
    update: unknown;
    isCurrent: () => boolean;
    addActivity: (update: ApiEphemeralActivityUpdate) => void;
    getMachine: (machineId: string) => Machine | undefined;
    applyMachine: (machine: Machine) => void;
    invalidateMachines: () => void;
    applySessionUsage: (sessionId: string, usage: LatestSessionUsage) => void;
    applySessionControl: (update: SessionControlUpdate) => void;
    warn: (message: string) => void;
    error: (message: string, detail?: unknown) => void;
    parseUpdate?: (update: unknown) => ApiEphemeralUpdate | null;
};

/** Parse and dispatch one realtime ephemeral update while isolating store side effects. */
export function handleEphemeralRealtime(
    params: EphemeralRealtimeHandlerParams,
): void {
    if (!params.isCurrent()) {
        return;
    }

    const parseUpdate = params.parseUpdate ?? parseEphemeralUpdate;
    const updateData = parseUpdate(params.update);
    if (!updateData) {
        params.warn('Invalid ephemeral update received');
        params.error('Invalid ephemeral update received:', params.update);
        return;
    }

    const dispatch = buildEphemeralUpdateDispatch(updateData);
    if (dispatch.activity && updateData.type === 'activity') {
        params.addActivity(updateData);
    }

    if (dispatch.machineActivity && updateData.type === 'machine-activity') {
        applyMachineActivity(params, updateData);
    }

    if (dispatch.usage && updateData.type === 'usage') {
        params.applySessionUsage(updateData.id, buildLatestUsageFromEphemeral(updateData));
    }

    if (dispatch.sessionControl && updateData.type === 'session-control') {
        params.applySessionControl(updateData);
    }
}

function applyMachineActivity(
    params: EphemeralRealtimeHandlerParams,
    update: MachineActivityUpdate,
): void {
    const result = applyMachineActivityUpdate(params.getMachine(update.id), update);
    if (result.kind === 'missing') {
        params.error(`Machine ${update.id} not found for realtime activity update`);
        params.invalidateMachines();
        return;
    }
    params.applyMachine(result.machine);
}
