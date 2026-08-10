import type { AccountRequest } from './accountLifecycle';
import type { Machine } from './storageTypes';
import type { MachineEncryption } from './encryption/machineEncryption';
import { buildDecryptedMachineProjection } from './machineDecryptionProjection';
import { reconcileMachineSnapshot } from './machineSnapshot';

export type MachineSnapshotRecord = {
    id: string;
    metadata: string;
    metadataVersion: number;
    daemonState?: string | null;
    daemonStateVersion?: number;
    dataEncryptionKey?: string | null;
    seq: number;
    active: boolean;
    activeAt: number;
    createdAt: number;
    updatedAt: number;
};

type MachineSnapshotEncryption = {
    decryptEncryptionKey: (encrypted: string) => Promise<Uint8Array | null>;
    initializeMachines: (machines: Map<string, Uint8Array | null>) => Promise<void>;
    getMachineEncryption: (machineId: string) => Pick<MachineEncryption, 'decryptMetadata' | 'decryptDaemonState'> | null;
};

export type MachineSnapshotApplicationResult = {
    rawMachineIds: string[];
    decryptedMachines: Machine[];
    decryptedMachineKeys: Map<string, Uint8Array>;
    failedMachineIds: string[];
};

export async function decryptMachineSnapshot(params: {
    machines: MachineSnapshotRecord[];
    encryption: MachineSnapshotEncryption;
    request: AccountRequest;
}): Promise<MachineSnapshotApplicationResult> {
    const { machines, encryption, request } = params;
    request.assertCurrent();

    const machineKeysMap = new Map<string, Uint8Array | null>();
    const decryptedMachineKeys = new Map<string, Uint8Array>();
    const failedMachineIds = new Set<string>();
    for (const machine of machines) {
        if (machine.dataEncryptionKey) {
            const decryptedKey = await encryption.decryptEncryptionKey(machine.dataEncryptionKey);
            request.assertCurrent();
            if (!decryptedKey) {
                console.error(`Failed to decrypt data encryption key for machine ${machine.id}`);
                failedMachineIds.add(machine.id);
                continue;
            }
            machineKeysMap.set(machine.id, decryptedKey);
            decryptedMachineKeys.set(machine.id, decryptedKey);
        } else {
            machineKeysMap.set(machine.id, null);
        }
    }

    await encryption.initializeMachines(machineKeysMap);
    request.assertCurrent();

    const decryptedMachines: Machine[] = [];
    for (const machine of machines) {
        const machineEncryption = encryption.getMachineEncryption(machine.id);
        if (!machineEncryption) {
            console.error(`Machine encryption not found for ${machine.id} - this should never happen`);
            failedMachineIds.add(machine.id);
            continue;
        }

        try {
            const metadata = machine.metadata
                ? await machineEncryption.decryptMetadata(machine.metadataVersion, machine.metadata)
                : null;
            const daemonState = machine.daemonState
                ? await machineEncryption.decryptDaemonState(machine.daemonStateVersion || 0, machine.daemonState)
                : null;
            request.assertCurrent();

            decryptedMachines.push(buildDecryptedMachineProjection(machine, metadata, daemonState));
        } catch (error) {
            request.assertCurrent();
            console.error(`Failed to decrypt machine ${machine.id}:`, error);
            failedMachineIds.add(machine.id);
            decryptedMachines.push({
                id: machine.id,
                seq: machine.seq,
                createdAt: machine.createdAt,
                updatedAt: machine.updatedAt,
                active: machine.active,
                activeAt: machine.activeAt,
                metadata: null,
                metadataVersion: machine.metadataVersion,
                daemonState: null,
                daemonStateVersion: 0,
            });
        }
    }

    return {
        rawMachineIds: machines.map((machine) => machine.id),
        decryptedMachines,
        decryptedMachineKeys,
        failedMachineIds: [...failedMachineIds],
    };
}

export type MachineSnapshotApplyResult = {
    reconciledMachines: Machine[];
    shouldRetry: boolean;
    ignoredEmptySnapshot: boolean;
};

/** Apply a decrypted machine snapshot without turning transient failures into deletes. */
export function applyMachineSnapshot(params: {
    rawMachineIds: string[];
    decryptedMachines: Machine[];
    failedMachineIds: string[];
    existingMachines: Record<string, Machine>;
    existingMachineIdsAtStart?: string[];
}): MachineSnapshotApplyResult {
    const existingCount = Object.keys(params.existingMachines).length;
    return {
        reconciledMachines: reconcileMachineSnapshot(params),
        shouldRetry: params.failedMachineIds.length > 0,
        ignoredEmptySnapshot: params.rawMachineIds.length === 0 && existingCount > 0,
    };
}
