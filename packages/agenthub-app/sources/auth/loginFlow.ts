export type RestoreQrAuthState = {
    isAuthenticated: boolean;
    isFocused: boolean;
};

export type AuthLoginOptions = {
    restoreExistingAccount?: boolean;
};

export type AuthLoginSyncMode = 'create' | 'restore';

export function getPostAuthLoginRoute(): '/' {
    return '/';
}

export function shouldRunRestoreQrAuth(state: RestoreQrAuthState): boolean {
    return state.isFocused && !state.isAuthenticated;
}

export function canSubmitManualRestoreKey(key: string): boolean {
    return key.trim().length > 0;
}

export function getSyncModeForLogin(options?: AuthLoginOptions): AuthLoginSyncMode {
    return options?.restoreExistingAccount ? 'restore' : 'create';
}
