import {
    handleEphemeralRealtime,
    type EphemeralRealtimeHandlerParams,
} from './ephemeralRealtimeHandler';

export type EphemeralRealtimeDispatchContext = {
    isCurrent: (generation: number) => boolean;
    addActivity: EphemeralRealtimeHandlerParams['addActivity'];
    getMachine: EphemeralRealtimeHandlerParams['getMachine'];
    applyMachine: EphemeralRealtimeHandlerParams['applyMachine'];
    invalidateMachines: EphemeralRealtimeHandlerParams['invalidateMachines'];
    applySessionUsage: EphemeralRealtimeHandlerParams['applySessionUsage'];
    applySessionControl: EphemeralRealtimeHandlerParams['applySessionControl'];
    warn: EphemeralRealtimeHandlerParams['warn'];
    error: EphemeralRealtimeHandlerParams['error'];
    handleEphemeral?: typeof handleEphemeralRealtime;
};

/** Bind an account generation to ephemeral realtime handling without owning update semantics. */
export function dispatchEphemeralRealtimeUpdate(
    update: unknown,
    generation: number,
    params: EphemeralRealtimeDispatchContext,
): void {
    const handler = params.handleEphemeral ?? handleEphemeralRealtime;
    handler({
        update,
        isCurrent: () => params.isCurrent(generation),
        addActivity: params.addActivity,
        getMachine: params.getMachine,
        applyMachine: params.applyMachine,
        invalidateMachines: params.invalidateMachines,
        applySessionUsage: params.applySessionUsage,
        applySessionControl: params.applySessionControl,
        warn: params.warn,
        error: params.error,
    });
}
