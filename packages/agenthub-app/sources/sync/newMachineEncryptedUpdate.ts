import type { ApiUpdate } from './apiTypes';
import type { Machine } from './storageTypes';

type NewMachineUpdate = Extract<ApiUpdate, { t: 'new-machine' }>;

type MachineEncryptionLike = {
    decryptMetadata: (version: number, encrypted: string) => Promise<Machine['metadata']>;
    decryptDaemonState: (version: number, encrypted: string | null | undefined) => Promise<Machine['daemonState']>;
};

type NewMachineEncryptedUpdateParams = {
    machine: Machine;
    update: NewMachineUpdate;
    encryption: MachineEncryptionLike;
    assertCurrent: () => void;
    onError?: (field: 'metadata' | 'daemonState', error: unknown) => void;
};

/** Apply new-machine encrypted fields without erasing an existing projection on failure. */
export async function applyNewMachineEncryptedUpdate(
    params: NewMachineEncryptedUpdateParams,
): Promise<Machine> {
    const updated = { ...params.machine };
    const onError = params.onError ?? (() => undefined);

    if (params.update.metadata) {
        let metadata: Machine['metadata'] | undefined;
        try {
            metadata = await params.encryption.decryptMetadata(params.update.metadataVersion, params.update.metadata);
        } catch (error) {
            onError('metadata', error);
            metadata = undefined;
        }
        if (metadata !== null && metadata !== undefined) {
            params.assertCurrent();
            updated.metadata = metadata;
            updated.metadataVersion = params.update.metadataVersion;
        }
    }

    if (params.update.daemonState) {
        let daemonState: Machine['daemonState'] | undefined;
        try {
            daemonState = await params.encryption.decryptDaemonState(params.update.daemonStateVersion, params.update.daemonState);
        } catch (error) {
            onError('daemonState', error);
            daemonState = undefined;
        }
        if (daemonState !== null && daemonState !== undefined) {
            params.assertCurrent();
            updated.daemonState = daemonState;
            updated.daemonStateVersion = params.update.daemonStateVersion;
        }
    }

    return updated;
}
