import type { Machine } from './storageTypes';

export interface MachineActivityUpdate {
    id: string;
    active: boolean;
    activeAt: number;
}

/** Apply volatile machine activity without touching encrypted or versioned fields. */
export function buildMachineActivityProjection(
    machine: Machine,
    update: MachineActivityUpdate,
): Machine {
    return {
        ...machine,
        active: update.active,
        activeAt: update.activeAt,
    };
}
