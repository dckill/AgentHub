import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { isTauri } from '@/utils/isTauri';
import { TauriCredentialStorage } from './tauriCredentialStorage';

const AUTH_KEY = 'auth_credentials';

// Web credentials deliberately live only for the lifetime of this JS page.
// Native credentials are persisted by the operating-system secure store.
let credentialsCache: string | null = null;

function removeLegacyWebCredentials(): void {
    if (typeof window === 'undefined') {
        return;
    }

    for (const storage of [window.localStorage, window.sessionStorage]) {
        try {
            // Never read or migrate the old value: delete the legacy secret in place.
            storage.removeItem(AUTH_KEY);
        } catch {
            // Storage can be unavailable in privacy/sandboxed contexts. This must not
            // prevent an otherwise memory-only login from working.
        }
    }
}

export interface AuthCredentials {
    token: string;
    secret: string;
}

export const TokenStorage = {
    async getCredentials(): Promise<AuthCredentials | null> {
        if (Platform.OS === 'web') {
            if (isTauri()) {
                return TauriCredentialStorage.getCredentials();
            }
            removeLegacyWebCredentials();
            return credentialsCache ? JSON.parse(credentialsCache) as AuthCredentials : null;
        }
        try {
            const stored = await SecureStore.getItemAsync(AUTH_KEY);
            if (!stored) return null;
            credentialsCache = stored; // Update cache
            return JSON.parse(stored) as AuthCredentials;
        } catch (error) {
            console.error('Error getting credentials:', error);
            return null;
        }
    },

    async setCredentials(credentials: AuthCredentials): Promise<boolean> {
        if (Platform.OS === 'web') {
            if (isTauri()) {
                return TauriCredentialStorage.setCredentials(credentials);
            }
            removeLegacyWebCredentials();
            credentialsCache = JSON.stringify(credentials);
            return true;
        }
        try {
            const json = JSON.stringify(credentials);
            await SecureStore.setItemAsync(AUTH_KEY, json);
            credentialsCache = json; // Update cache
            return true;
        } catch (error) {
            console.error('Error setting credentials:', error);
            return false;
        }
    },

    async removeCredentials(): Promise<boolean> {
        if (Platform.OS === 'web') {
            if (isTauri()) {
                return TauriCredentialStorage.removeCredentials();
            }
            removeLegacyWebCredentials();
            credentialsCache = null;
            return true;
        }
        try {
            await SecureStore.deleteItemAsync(AUTH_KEY);
            credentialsCache = null; // Clear cache
            return true;
        } catch (error) {
            console.error('Error removing credentials:', error);
            return false;
        }
    },
};
