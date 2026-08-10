import { describe, expect, it, vi } from 'vitest';
import type { ManagedCredential } from '@/sync/apiCredentials';
import { runCredentialEditLoad, runCredentialEditSave } from './credentialEditLifecycle';

const credential: ManagedCredential = {
    id: 'credential-1',
    label: 'Claude',
    agent: 'claude',
    hasApiKey: true,
    baseUrl: null,
    modelOverrides: null,
    lastUsedAt: null,
    createdAt: '2026-08-06T00:00:00.000Z',
    updatedAt: '2026-08-06T00:00:00.000Z',
};

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

describe('credential edit lifecycle', () => {
    it('does not apply an old credential response after the account becomes stale', async () => {
        const response = deferred<ManagedCredential>();
        let current = true;
        const apply = vi.fn();
        const setLoadState = vi.fn();
        const setError = vi.fn();

        const loading = runCredentialEditLoad({
            fetchCredential: () => response.promise,
            isCurrent: () => current,
            apply,
            setLoadState,
            setError,
            errorMessage: 'load-failed',
        });
        current = false;
        response.resolve(credential);
        await loading;

        expect(apply).not.toHaveBeenCalled();
        expect(setLoadState).toHaveBeenCalledWith('loading');
        expect(setLoadState).not.toHaveBeenCalledWith('ready');
    });

    it('does not navigate after a stale save response', async () => {
        const response = deferred<void>();
        let current = true;
        const onSuccess = vi.fn();
        const setError = vi.fn();

        const saving = runCredentialEditSave({
            save: () => response.promise,
            isCurrent: () => current,
            onSuccess,
            setError,
            errorMessage: 'save-failed',
        });
        current = false;
        response.resolve();
        await saving;

        expect(onSuccess).not.toHaveBeenCalled();
        expect(setError).not.toHaveBeenCalledWith('save-failed');
    });
});
