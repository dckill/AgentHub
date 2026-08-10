import type { ApiUpdate } from './apiTypes';
import { applyMachineEncryptedUpdate } from './machineEncryptedUpdate';
import { buildMachineUpdateProjection } from './machineUpdateProjection';
import type { Machine } from './storageTypes';

type MachineUpdate = Extract<ApiUpdate, { t: 'update-machine' }>;
type MachineEncryptionLike = Parameters<typeof applyMachineEncryptedUpdate>[0]['encryption'];

export type MachineUpdateApplicationResult =
    | { kind: 'missing-machine'; machineId: string }
    | { kind: 'missing-encryption'; machineId: string }
    | { kind: 'applied'; machine: Machine };

/** Apply the machine projection and its encrypted fields as one guarded update. */
export async function applyMachineUpdate(params: {
    machineId: string;
    existing: Machine | undefined;
    update: MachineUpdate;
    seq: number;
    createdAt: number;
    encryption: MachineEncryptionLike | null;
    assertCurrent: () => void;
    onError?: (field: 'metadata' | 'daemonState', error: unknown) => void;
}): Promise<MachineUpdateApplicationResult> {
    if (!params.existing) {
        return { kind: 'missing-machine', machineId: params.machineId };
    }
    if (!params.encryption) {
        return { kind: 'missing-encryption', machineId: params.machineId };
    }

    const projected = buildMachineUpdateProjection(
        params.machineId,
        params.existing,
        params.update,
        params.seq,
        params.createdAt,
    );
    const machine = await applyMachineEncryptedUpdate({
        machine: projected,
        update: params.update,
        encryption: params.encryption,
        assertCurrent: params.assertCurrent,
        onError: params.onError,
    });
    return { kind: 'applied', machine };
}
