import type { ManagedCredential } from '@/sync/apiCredentials';

export type CredentialsLoadState = 'loading' | 'ready' | 'error';

/** Bind managed-credential list projection to the account that started the request. */
export async function runCredentialsLoad(options: {
    fetchCredentials: () => Promise<ManagedCredential[]>;
    isCurrent: () => boolean;
    setCredentials: (credentials: ManagedCredential[]) => void;
    setLoadState: (state: CredentialsLoadState) => void;
    setError: (error: string | null) => void;
    errorMessage: string;
    onError?: (error: unknown) => void;
}): Promise<boolean> {
    if (!options.isCurrent()) return false;

    options.setLoadState('loading');
    options.setError(null);
    try {
        const credentials = await options.fetchCredentials();
        if (!options.isCurrent()) return false;
        options.setCredentials(credentials);
        options.setLoadState('ready');
        return true;
    } catch (error) {
        if (!options.isCurrent()) return false;
        options.setLoadState('error');
        options.setError(options.errorMessage);
        options.onError?.(error);
        return false;
    }
}
