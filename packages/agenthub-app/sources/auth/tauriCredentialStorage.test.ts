import { beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

const invoke = vi.hoisted(() => vi.fn());
vi.mock('@tauri-apps/api/core', () => ({ invoke }));

import { TauriCredentialStorage } from './tauriCredentialStorage';

const credentials = {
    token: 'header.payload.signature',
    secret: 'desktop-root-secret',
};

describe('TauriCredentialStorage', () => {
    beforeEach(() => invoke.mockReset());

    it('validates credentials returned by the Rust keyring command', async () => {
        invoke.mockResolvedValue(credentials);

        await expect(TauriCredentialStorage.getCredentials()).resolves.toEqual(credentials);
        expect(invoke).toHaveBeenCalledWith('credential_get');
    });

    it('rejects malformed keyring payloads instead of authenticating with partial data', async () => {
        invoke.mockResolvedValue({ token: credentials.token });

        await expect(TauriCredentialStorage.getCredentials()).rejects.toBeInstanceOf(z.ZodError);
    });

    it('writes and deletes credentials through fixed Rust commands', async () => {
        invoke.mockResolvedValue(undefined);

        await expect(TauriCredentialStorage.setCredentials(credentials)).resolves.toBe(true);
        await expect(TauriCredentialStorage.removeCredentials()).resolves.toBe(true);

        expect(invoke).toHaveBeenNthCalledWith(1, 'credential_set', { credentials });
        expect(invoke).toHaveBeenNthCalledWith(2, 'credential_remove');
    });
});
