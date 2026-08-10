import type { Machine } from './storageTypes';

type MachineEnvelope = Pick<Machine, 'id' | 'seq' | 'createdAt' | 'updatedAt' | 'active' | 'activeAt' | 'metadataVersion'> & {
    daemonStateVersion?: number;
};

/** Combine decrypted machine fields with the server envelope after cipher work succeeds. */
export function buildDecryptedMachineProjection(
    machine: MachineEnvelope,
    metadata: Machine['metadata'],
    daemonState: Machine['daemonState'],
): Machine {
    return {
        id: machine.id,
        seq: machine.seq,
        createdAt: machine.createdAt,
        updatedAt: machine.updatedAt,
        active: machine.active,
        activeAt: machine.activeAt,
        metadata,
        metadataVersion: machine.metadataVersion,
        daemonState,
        daemonStateVersion: machine.daemonStateVersion || 0,
    };
}
