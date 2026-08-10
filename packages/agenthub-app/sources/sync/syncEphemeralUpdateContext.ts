import type { EphemeralRealtimeDispatchContext } from './ephemeralRealtimeDispatch';

export type SyncEphemeralUpdateContextBindings = Omit<EphemeralRealtimeDispatchContext, 'isCurrent'> & {
    generation: number;
    isCurrent: (generation: number) => boolean;
};

/** Bind all ephemeral realtime callbacks to one account generation. */
export function createSyncEphemeralUpdateContext(
    bindings: SyncEphemeralUpdateContextBindings,
): EphemeralRealtimeDispatchContext {
    const { generation, isCurrent, ...callbacks } = bindings;
    return {
        ...callbacks,
        isCurrent: () => isCurrent(generation),
    };
}
