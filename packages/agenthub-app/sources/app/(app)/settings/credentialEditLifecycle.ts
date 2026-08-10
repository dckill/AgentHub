import type { ManagedCredential } from '@/sync/apiCredentials';
import type { CredentialsLoadState } from './credentialsLifecycle';

export async function runCredentialEditLoad(options: {
    fetchCredential: () => Promise<ManagedCredential>;
    isCurrent: () => boolean;
    apply: (credential: ManagedCredential) => void;
    setLoadState: (state: CredentialsLoadState) => void;
    setError: (error: string | null) => void;
    errorMessage: string;
}): Promise<boolean> {
    if (!options.isCurrent()) return false;
    options.setLoadState('loading');
    options.setError(null);
    try {
        const credential = await options.fetchCredential();
        if (!options.isCurrent()) return false;
        options.apply(credential);
        options.setLoadState('ready');
        return true;
    } catch {
        if (!options.isCurrent()) return false;
        options.setLoadState('error');
        options.setError(options.errorMessage);
        return false;
    }
}

export async function runCredentialEditSave(options: {
    save: () => Promise<void>;
    isCurrent: () => boolean;
    onSuccess: () => void;
    setError: (error: string | null) => void;
    errorMessage: string;
}): Promise<boolean> {
    if (!options.isCurrent()) return false;
    try {
        await options.save();
        if (!options.isCurrent()) return false;
        options.onSuccess();
        return true;
    } catch {
        if (!options.isCurrent()) return false;
        options.setError(options.errorMessage);
        return false;
    }
}
