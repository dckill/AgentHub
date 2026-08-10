import type { Machine } from './storageTypes';
import { buildMachineActivityProjection, type MachineActivityUpdate } from './machineActivityProjection';

export type MachineActivityApplicationResult =
    | { kind: 'missing' }
    | { kind: 'updated'; machine: Machine };

/** Apply volatile machine activity without touching encrypted/versioned state. */
export function applyMachineActivityUpdate(
    machine: Machine | undefined,
    update: MachineActivityUpdate,
): MachineActivityApplicationResult {
    if (!machine) {
        return { kind: 'missing' };
    }

    return {
        kind: 'updated',
        machine: buildMachineActivityProjection(machine, update),
    };
}
