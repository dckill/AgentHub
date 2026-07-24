import type { AuthCredentials } from './tokenStorage';

export async function initializeAccountRuntime(options: {
    credentials: AuthCredentials;
    shutdown: () => Promise<void>;
    saveCredentials: (credentials: AuthCredentials) => Promise<boolean>;
    initialize: (credentials: AuthCredentials) => Promise<void>;
    removeCredentials: () => Promise<unknown>;
}): Promise<void> {
    await options.shutdown();
    const saved = await options.saveCredentials(options.credentials);
    if (!saved) {
        throw new Error('Failed to save credentials');
    }

    try {
        await options.initialize(options.credentials);
    } catch (error) {
        await options.removeCredentials();
        await options.shutdown();
        throw error;
    }
}

export async function shutdownAccountRuntime(options: {
    revokePushToken?: () => Promise<void>;
    shutdown: () => Promise<void>;
    clearPersistence: () => void;
    removeCredentials: () => Promise<unknown>;
    warn?: (message: string, error: unknown) => void;
}): Promise<void> {
    if (options.revokePushToken) {
        try {
            await options.revokePushToken();
        } catch (error) {
            options.warn?.('Failed to unregister push token during logout:', error);
        }
    }
    let firstError: unknown;
    try {
        await options.shutdown();
    } catch (error) {
        firstError = error;
    }
    try {
        options.clearPersistence();
    } catch (error) {
        firstError ??= error;
    }
    try {
        await options.removeCredentials();
    } catch (error) {
        firstError ??= error;
    }
    if (firstError) {
        throw firstError;
    }
}

export async function switchAccountServer(options: {
    revokePushToken?: () => Promise<void>;
    shutdown: () => Promise<void>;
    clearPersistence: () => void;
    removeCredentials: () => Promise<boolean>;
    commitServer: () => void;
    warn?: (message: string, error: unknown) => void;
}): Promise<void> {
    await shutdownAccountRuntime({
        revokePushToken: options.revokePushToken,
        shutdown: options.shutdown,
        clearPersistence: options.clearPersistence,
        removeCredentials: async () => {
            if (!await options.removeCredentials()) {
                throw new Error('Failed to remove credentials');
            }
        },
        warn: options.warn,
    });
    options.commitServer();
}
