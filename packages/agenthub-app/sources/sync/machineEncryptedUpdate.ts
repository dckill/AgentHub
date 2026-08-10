import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';

type MachineUpdate = Extract<ApiUpdate, { t: 'update-machine' }>;

type MachineEncryptionLike = {
    decryptMetadata: (version: number, encrypted: string) => Promise<Machine['metadata']>;
    decryptDaemonState: (version: number, encrypted: string | null | undefined) => Promise<Machine['daemonState']>;
};

type MachineEncryptedUpdateParams = {
    machine: Machine;
    update: MachineUpdate;
    encryption: MachineEncryptionLike;
    assertCurrent: () => void;
    onError?: (field: 'metadata' | 'daemonState', error: unknown) => void;
};

/** Apply encrypted machine fields while keeping independent field failures isolated. */
export async function applyMachineEncryptedUpdate(
    params: MachineEncryptedUpdateParams,
): Promise<Machine> {
    const updated = { ...params.machine };
    const onError = params.onError ?? (() => undefined);

    if (params.update.metadata) {
        const metadataUpdate = params.update.metadata;
        let metadata: Machine['metadata'] | undefined;
        try {
            metadata = await params.encryption.decryptMetadata(metadataUpdate.version, metadataUpdate.value);
        } catch (error) {
            onError('metadata', error);
            metadata = undefined;
        }
        if (metadata !== undefined) {
            params.assertCurrent();
            updated.metadata = metadata;
            updated.metadataVersion = metadataUpdate.version;
        }
    }

    if (params.update.daemonState) {
        const daemonStateUpdate = params.update.daemonState;
        let daemonState: Machine['daemonState'] | undefined;
        try {
            daemonState = await params.encryption.decryptDaemonState(daemonStateUpdate.version, daemonStateUpdate.value);
        } catch (error) {
            onError('daemonState', error);
            daemonState = undefined;
        }
        if (daemonState !== undefined) {
            params.assertCurrent();
            updated.daemonState = daemonState;
            updated.daemonStateVersion = daemonStateUpdate.version;
        }
    }

    return updated;
}
