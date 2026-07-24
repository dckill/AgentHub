import { describe, expect, it, vi } from 'vitest';
import { initializeRootRuntime } from '../auth/rootInitialization';

const credentials = { token: 'token', secret: 'secret' };

describe('initializeRootRuntime', () => {
    it('returns ready only after assets, credentials and account restore succeed', async () => {
        const loadAssets = vi.fn().mockResolvedValue(undefined);
        const getCredentials = vi.fn().mockResolvedValue(credentials);
        const restore = vi.fn().mockResolvedValue(undefined);
        const cleanup = vi.fn();

        await expect(initializeRootRuntime({ loadAssets, getCredentials, restore, cleanup }))
            .resolves.toEqual({ status: 'ready', credentials });
        expect(restore).toHaveBeenCalledWith(credentials);
        expect(cleanup).not.toHaveBeenCalled();
    });

    it('returns a recoverable error without treating secure-store failure as signed out', async () => {
        const failure = new Error('credential_read_failed');
        const cleanup = vi.fn().mockResolvedValue(undefined);

        await expect(initializeRootRuntime({
            loadAssets: vi.fn().mockResolvedValue(undefined),
            getCredentials: vi.fn().mockRejectedValue(failure),
            restore: vi.fn(),
            cleanup,
        })).resolves.toEqual({ status: 'error' });
        expect(cleanup).toHaveBeenCalledOnce();
    });

    it('cleans partial sync state when account restore fails', async () => {
        const cleanup = vi.fn().mockRejectedValue(new Error('cleanup also failed'));

        await expect(initializeRootRuntime({
            loadAssets: vi.fn().mockResolvedValue(undefined),
            getCredentials: vi.fn().mockResolvedValue(credentials),
            restore: vi.fn().mockRejectedValue(new Error('restore failed')),
            cleanup,
        })).resolves.toEqual({ status: 'error' });
        expect(cleanup).toHaveBeenCalledOnce();
    });

    it('skips account restore when no credentials exist', async () => {
        const restore = vi.fn();

        await expect(initializeRootRuntime({
            loadAssets: vi.fn().mockResolvedValue(undefined),
            getCredentials: vi.fn().mockResolvedValue(null),
            restore,
            cleanup: vi.fn(),
        })).resolves.toEqual({ status: 'ready', credentials: null });
        expect(restore).not.toHaveBeenCalled();
    });

    it('recovers when the user retries after a transient initialization failure', async () => {
        const loadAssets = vi.fn()
            .mockRejectedValueOnce(new Error('font network failed'))
            .mockResolvedValueOnce(undefined);
        const dependencies = {
            loadAssets,
            getCredentials: vi.fn().mockResolvedValue(credentials),
            restore: vi.fn().mockResolvedValue(undefined),
            cleanup: vi.fn().mockResolvedValue(undefined),
        };

        await expect(initializeRootRuntime(dependencies)).resolves.toEqual({ status: 'error' });
        await expect(initializeRootRuntime(dependencies)).resolves.toEqual({ status: 'ready', credentials });
        expect(dependencies.cleanup).toHaveBeenCalledOnce();
        expect(dependencies.restore).toHaveBeenCalledOnce();
    });
});
