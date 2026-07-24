import { describe, expect, it, vi } from 'vitest';
import { initializeAccountRuntime, shutdownAccountRuntime, switchAccountServer } from './accountRuntime';

describe('account runtime orchestration', () => {
    it('fully shuts down account A before persisting and starting account B', async () => {
        const calls: string[] = [];
        const credentials = { token: 'token-b', secret: 'secret-b' };

        await initializeAccountRuntime({
            credentials,
            shutdown: async () => { calls.push('shutdown-a'); },
            saveCredentials: async () => { calls.push('save-b'); return true; },
            initialize: async () => { calls.push('initialize-b'); },
            removeCredentials: async () => { calls.push('remove'); },
        });

        expect(calls).toEqual(['shutdown-a', 'save-b', 'initialize-b']);
    });

    it('rolls back credentials and runtime when account B initialization fails', async () => {
        const calls: string[] = [];
        const initializationError = new Error('invalid account B');

        await expect(initializeAccountRuntime({
            credentials: { token: 'token-b', secret: 'secret-b' },
            shutdown: async () => { calls.push('shutdown'); },
            saveCredentials: async () => { calls.push('save'); return true; },
            initialize: async () => { calls.push('initialize'); throw initializationError; },
            removeCredentials: async () => { calls.push('remove'); },
        })).rejects.toBe(initializationError);

        expect(calls).toEqual(['shutdown', 'save', 'initialize', 'remove', 'shutdown']);
    });

    it('continues logout cleanup when push token revocation fails', async () => {
        const calls: string[] = [];
        const warn = vi.fn();

        await shutdownAccountRuntime({
            revokePushToken: async () => { calls.push('revoke'); throw new Error('offline'); },
            shutdown: async () => { calls.push('shutdown'); },
            clearPersistence: () => { calls.push('clear'); },
            removeCredentials: async () => { calls.push('remove'); },
            warn,
        });

        expect(calls).toEqual(['revoke', 'shutdown', 'clear', 'remove']);
        expect(warn).toHaveBeenCalledOnce();
    });

    it('removes persisted credentials even when runtime shutdown fails', async () => {
        const calls: string[] = [];
        const shutdownError = new Error('shutdown failed');

        await expect(shutdownAccountRuntime({
            shutdown: async () => { calls.push('shutdown'); throw shutdownError; },
            clearPersistence: () => { calls.push('clear'); },
            removeCredentials: async () => { calls.push('remove'); },
        })).rejects.toBe(shutdownError);

        expect(calls).toEqual(['shutdown', 'clear', 'remove']);
    });

    it('commits a server endpoint only after the old account is fully removed', async () => {
        const calls: string[] = [];

        await switchAccountServer({
            shutdown: async () => { calls.push('shutdown'); },
            clearPersistence: () => { calls.push('clear'); },
            removeCredentials: async () => { calls.push('remove'); return true; },
            commitServer: () => { calls.push('commit-server'); },
        });

        expect(calls).toEqual(['shutdown', 'clear', 'remove', 'commit-server']);
    });

    it('does not split endpoints when removing old credentials fails', async () => {
        const calls: string[] = [];

        await expect(switchAccountServer({
            shutdown: async () => { calls.push('shutdown'); },
            clearPersistence: () => { calls.push('clear'); },
            removeCredentials: async () => { calls.push('remove'); return false; },
            commitServer: () => { calls.push('commit-server'); },
        })).rejects.toThrow('Failed to remove credentials');

        expect(calls).toEqual(['shutdown', 'clear', 'remove']);
    });
});
