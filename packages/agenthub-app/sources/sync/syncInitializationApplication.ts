import type { AppStateStatus } from 'react-native';

export type SyncInitializationCredentials = {
    secret: string;
    token: string;
};

export type SyncSocketStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export type SyncInitializationApplicationParams<
    Credentials extends SyncInitializationCredentials = SyncInitializationCredentials,
    EncryptionInstance extends { anonID: string } = { anonID: string },
> = {
    credentials: Credentials;
    restore: boolean;
    endpoint: string;
    deviceId: string;
    appState?: AppStateStatus;
    decodeSecret: (secret: string) => Uint8Array;
    createEncryption: (secretKey: Uint8Array) => Promise<EncryptionInstance>;
    assertCurrent: () => void;
    initializeTracking: (anonID: string) => void;
    initializeSocket: (
        options: { endpoint: string; token: string; deviceId: string; appState?: AppStateStatus },
        encryption: EncryptionInstance,
    ) => void;
    onSocketStatusChange: (listener: (status: SyncSocketStatus) => void) => void;
    setSocketStatus: (status: SyncSocketStatus) => void;
    createAccount: (credentials: Credentials, encryption: EncryptionInstance) => Promise<void>;
    restoreAccount: (credentials: Credentials, encryption: EncryptionInstance) => Promise<void>;
};

/** Run the account-independent initialization sequence before delegating to create/restore. */
export async function runSyncInitializationApplication<
    Credentials extends SyncInitializationCredentials,
    EncryptionInstance extends { anonID: string },
>(params: SyncInitializationApplicationParams<Credentials, EncryptionInstance>): Promise<void> {
    const secretKey = params.decodeSecret(params.credentials.secret);
    if (secretKey.length !== 32) {
        throw new Error(`Invalid secret key length: ${secretKey.length}, expected 32`);
    }

    const encryption = await params.createEncryption(secretKey);
    params.assertCurrent();
    params.initializeTracking(encryption.anonID);
    params.assertCurrent();
    params.initializeSocket({
        endpoint: params.endpoint,
        token: params.credentials.token,
        deviceId: params.deviceId,
        appState: params.appState,
    }, encryption);
    params.assertCurrent();
    params.onSocketStatusChange((status) => params.setSocketStatus(status));

    if (params.restore) {
        await params.restoreAccount(params.credentials, encryption);
    } else {
        await params.createAccount(params.credentials, encryption);
    }
}
