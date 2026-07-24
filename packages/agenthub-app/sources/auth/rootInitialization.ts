import type { AuthCredentials } from './tokenStorage';

export type RootInitializationState =
    | { status: 'loading' }
    | { status: 'ready'; credentials: AuthCredentials | null }
    | { status: 'error' };

export async function initializeRootRuntime(dependencies: {
    loadAssets: () => Promise<void>;
    getCredentials: () => Promise<AuthCredentials | null>;
    restore: (credentials: AuthCredentials) => Promise<void>;
    cleanup: () => Promise<void> | void;
    onError?: (error: unknown) => void;
}): Promise<RootInitializationState> {
    try {
        await dependencies.loadAssets();
        const credentials = await dependencies.getCredentials();
        if (credentials) {
            await dependencies.restore(credentials);
        }
        return { status: 'ready', credentials };
    } catch (error) {
        dependencies.onError?.(error);
        try {
            await dependencies.cleanup();
        } catch (cleanupError) {
            dependencies.onError?.(cleanupError);
        }
        return { status: 'error' };
    }
}
