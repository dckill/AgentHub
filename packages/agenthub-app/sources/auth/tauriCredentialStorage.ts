import { invoke } from '@tauri-apps/api/core';
import { z } from 'zod';
import type { AuthCredentials } from './tokenStorage';

const AuthCredentialsSchema = z.object({
    token: z.string().min(1),
    secret: z.string().min(1),
}).strict();

export const TauriCredentialStorage = {
    async getCredentials(): Promise<AuthCredentials | null> {
        const stored = await invoke<unknown>('credential_get');
        return stored === null ? null : AuthCredentialsSchema.parse(stored);
    },

    async setCredentials(credentials: AuthCredentials): Promise<boolean> {
        const validated = AuthCredentialsSchema.parse(credentials);
        await invoke('credential_set', { credentials: validated });
        return true;
    },

    async removeCredentials(): Promise<boolean> {
        await invoke('credential_remove');
        return true;
    },
};
