import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { TokenStorage, AuthCredentials } from '@/auth/tokenStorage';
import { syncCreate, syncRestore, syncShutdown } from '@/sync/sync';
import { clearPersistence, loadRegisteredPushToken } from '@/sync/persistence';
import { unregisterPushToken } from '@/sync/apiPush';
import { Platform } from 'react-native';
import { trackLogout } from '@/track';
import { AuthLoginOptions, getSyncModeForLogin } from '@/auth/loginFlow';
import { initializeAccountRuntime, shutdownAccountRuntime } from './accountRuntime';
import { switchAccountServer } from './accountRuntime';
import { setServerUrl } from '@/sync/serverConfig';
import { createAccountOperationQueue } from './accountOperationQueue';

interface AuthContextType {
    isAuthenticated: boolean;
    credentials: AuthCredentials | null;
    login: (token: string, secret: string, options?: AuthLoginOptions) => Promise<void>;
    logout: () => Promise<void>;
    switchServer: (url: string | null) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children, initialCredentials }: { children: ReactNode; initialCredentials: AuthCredentials | null }) {
    const [isAuthenticated, setIsAuthenticated] = useState(!!initialCredentials);
    const [credentials, setCredentials] = useState<AuthCredentials | null>(initialCredentials);
    const accountOperations = useRef(createAccountOperationQueue()).current;

    // Update global auth state when local state changes
    useEffect(() => {
        setCurrentAuth(credentials ? { isAuthenticated, credentials, login, logout, switchServer } : null);
    }, [isAuthenticated, credentials]);

    const login = async (token: string, secret: string, options?: AuthLoginOptions) => accountOperations.run(async () => {
        const newCredentials: AuthCredentials = { token, secret };
        await initializeAccountRuntime({
            credentials: newCredentials,
            shutdown: syncShutdown,
            saveCredentials: TokenStorage.setCredentials,
            removeCredentials: TokenStorage.removeCredentials,
            initialize: getSyncModeForLogin(options) === 'restore' ? syncRestore : syncCreate,
        });
        setCredentials(newCredentials);
        setIsAuthenticated(true);
    });

    const logout = async () => accountOperations.run(async () => {
        trackLogout();
        const registeredPushToken = credentials ? loadRegisteredPushToken() : null;
        try {
            await shutdownAccountRuntime({
                revokePushToken: credentials && registeredPushToken
                    ? () => unregisterPushToken(credentials, registeredPushToken)
                    : undefined,
                shutdown: syncShutdown,
                clearPersistence,
                removeCredentials: TokenStorage.removeCredentials,
                warn: (message, error) => console.warn(message, error),
            });
        } finally {
            // Authentication state must never remain true after credentials were removed.
            setCredentials(null);
            setIsAuthenticated(false);

            if (Platform.OS === 'web') {
                window.location.reload();
            }
        }
        // On native, state is already cleared above; no reload needed
    });

    const switchServer = async (url: string | null) => accountOperations.run(async () => {
        trackLogout();
        const registeredPushToken = credentials ? loadRegisteredPushToken() : null;
        let committed = false;
        try {
            await switchAccountServer({
                revokePushToken: credentials && registeredPushToken
                    ? () => unregisterPushToken(credentials, registeredPushToken)
                    : undefined,
                shutdown: syncShutdown,
                clearPersistence,
                removeCredentials: TokenStorage.removeCredentials,
                commitServer: () => {
                    setServerUrl(url);
                    committed = true;
                },
                warn: (message, error) => console.warn(message, error),
            });
        } finally {
            setCredentials(null);
            setIsAuthenticated(false);
            if (committed && Platform.OS === 'web') {
                window.location.reload();
            }
        }
    });

    return (
        <AuthContext.Provider
            value={{
                isAuthenticated,
                credentials,
                login,
                logout,
                switchServer,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
}

// Helper to get current auth state for non-React contexts
let currentAuthState: AuthContextType | null = null;

export function setCurrentAuth(auth: AuthContextType | null) {
    currentAuthState = auth;
}

export function getCurrentAuth(): AuthContextType | null {
    return currentAuthState;
}
