import { describe, expect, it, vi } from 'vitest';
import type { ManagedCredential } from '@/sync/apiCredentials';
import { runCredentialsLoad } from './credentialsLifecycle';

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

describe('credentials settings lifecycle', () => {
    it('drops a list response after the account generation becomes stale', async () => {
        const response = deferred<ManagedCredential[]>();
        let current = true;
        const setCredentials = vi.fn();
        const setLoadState = vi.fn();
        const setError = vi.fn();

        const loading = runCredentialsLoad({
            fetchCredentials: () => response.promise,
            isCurrent: () => current,
            setCredentials,
            setLoadState,
            setError,
            errorMessage: 'load-failed',
        });

        current = false;
        response.resolve([credential]);
        await loading;

        expect(setCredentials).not.toHaveBeenCalled();
        expect(setLoadState).toHaveBeenCalledWith('loading');
        expect(setLoadState).not.toHaveBeenCalledWith('ready');
        expect(setError).not.toHaveBeenCalledWith('load-failed');
    });

    it('projects the current account list as ready', async () => {
        const setCredentials = vi.fn();
        const setLoadState = vi.fn();
        const setError = vi.fn();

        await runCredentialsLoad({
            fetchCredentials: async () => [credential],
            isCurrent: () => true,
            setCredentials,
            setLoadState,
            setError,
            errorMessage: 'load-failed',
        });

        expect(setCredentials).toHaveBeenCalledWith([credential]);
        expect(setLoadState).toHaveBeenLastCalledWith('ready');
        expect(setError).toHaveBeenCalledWith(null);
    });
});
