import type { ApiUpdate } from './apiTypes';
import { applyNewMachineEncryptedUpdate } from './newMachineEncryptedUpdate';
import { buildNewMachineProjection } from './newMachineProjection';
import { resolveNewMachineKey } from './newMachineKeyResolution';
import type { Machine } from './storageTypes';

type NewMachineUpdate = Extract<ApiUpdate, { t: 'new-machine' }>;
type MachineEncryptionLike = Parameters<typeof applyNewMachineEncryptedUpdate>[0]['encryption'];

export type NewMachineApplicationResult =
    | { kind: 'refresh'; reason: 'data-key' | 'encryption'; machine: Machine }
    | { kind: 'applied'; machine: Machine };

/** Resolve a new machine key, initialize its cipher, and apply encrypted fields atomically. */
export async function applyNewMachineUpdate(params: {
    existing: Machine | undefined;
    update: NewMachineUpdate;
    decryptDataEncryptionKey: (value: string) => Promise<Uint8Array | null>;
    storeDataKey: (machineId: string, key: Uint8Array) => void;
    initializeMachines: (machines: Map<string, Uint8Array | null>) => Promise<void>;
    getMachineEncryption: () => MachineEncryptionLike | null;
    assertCurrent: () => void;
    onError?: (field: 'metadata' | 'daemonState', error: unknown) => void;
}): Promise<NewMachineApplicationResult> {
    const keyResolution = await resolveNewMachineKey(
        params.update.dataEncryptionKey,
        params.decryptDataEncryptionKey,
    );
    params.assertCurrent();
    const projected = buildNewMachineProjection(params.existing, params.update);

    if (keyResolution.shouldRefresh) {
        return { kind: 'refresh', reason: 'data-key', machine: projected };
    }

    if (keyResolution.key) {
        params.storeDataKey(params.update.machineId, keyResolution.key);
    }
    await params.initializeMachines(new Map([[params.update.machineId, keyResolution.key]]));
    params.assertCurrent();
    const encryption = params.getMachineEncryption();
    if (!encryption) {
        return { kind: 'refresh', reason: 'encryption', machine: projected };
    }

    const machine = await applyNewMachineEncryptedUpdate({
        machine: projected,
        update: params.update,
        encryption,
        assertCurrent: params.assertCurrent,
        onError: params.onError,
    });
    return { kind: 'applied', machine };
}
