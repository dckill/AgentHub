import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStore = vi.hoisted(() => ({
    getItemAsync: vi.fn(),
    setItemAsync: vi.fn(),
    deleteItemAsync: vi.fn(),
}));

const platform = vi.hoisted(() => ({ OS: 'web' }));
const tauriRuntime = vi.hoisted(() => ({ active: false }));
const tauriStorage = vi.hoisted(() => ({
    getCredentials: vi.fn(),
    setCredentials: vi.fn(),
    removeCredentials: vi.fn(),
}));

vi.mock('expo-secure-store', () => secureStore);
vi.mock('react-native', () => ({ Platform: platform }));
vi.mock('@/utils/isTauri', () => ({ isTauri: () => tauriRuntime.active }));
vi.mock('./tauriCredentialStorage', () => ({ TauriCredentialStorage: tauriStorage }));

const credentials = {
    token: 'header.payload.signature',
    secret: 'root-secret-that-must-never-be-persisted',
};

describe('TokenStorage', () => {
    beforeEach(() => {
        vi.unstubAllGlobals();
        vi.resetModules();
        vi.clearAllMocks();
        platform.OS = 'web';
        tauriRuntime.active = false;
    });

    it('keeps web credentials only in module memory and only deletes the legacy browser key', async () => {
        const makeStorage = () => ({
            getItem: vi.fn(() => { throw new Error('credentials must not be read from browser persistence'); }),
            setItem: vi.fn(() => { throw new Error('credentials must not be written to browser persistence'); }),
            removeItem: vi.fn(),
        });
        const local = makeStorage();
        const session = makeStorage();
        vi.stubGlobal('window', { localStorage: local, sessionStorage: session });

        const { TokenStorage } = await import('./tokenStorage');

        await expect(TokenStorage.getCredentials()).resolves.toBeNull();
        await expect(TokenStorage.setCredentials(credentials)).resolves.toBe(true);
        await expect(TokenStorage.getCredentials()).resolves.toEqual(credentials);
        await expect(TokenStorage.removeCredentials()).resolves.toBe(true);
        await expect(TokenStorage.getCredentials()).resolves.toBeNull();
        expect(secureStore.getItemAsync).not.toHaveBeenCalled();
        expect(secureStore.setItemAsync).not.toHaveBeenCalled();
        expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
        expect(local.getItem).not.toHaveBeenCalled();
        expect(local.setItem).not.toHaveBeenCalled();
        expect(local.removeItem).toHaveBeenCalledWith('auth_credentials');
        expect(session.getItem).not.toHaveBeenCalled();
        expect(session.setItem).not.toHaveBeenCalled();
        expect(session.removeItem).toHaveBeenCalledWith('auth_credentials');
    });

    it('loses web credentials when the page module is reloaded', async () => {
        const firstModule = await import('./tokenStorage');
        await firstModule.TokenStorage.setCredentials(credentials);
        await expect(firstModule.TokenStorage.getCredentials()).resolves.toEqual(credentials);

        vi.resetModules();
        const reloadedModule = await import('./tokenStorage');

        await expect(reloadedModule.TokenStorage.getCredentials()).resolves.toBeNull();
    });

    it('routes Tauri WebViews exclusively through the Rust keyring adapter', async () => {
        tauriRuntime.active = true;
        tauriStorage.getCredentials.mockResolvedValue(credentials);
        tauriStorage.setCredentials.mockResolvedValue(true);
        tauriStorage.removeCredentials.mockResolvedValue(true);
        const { TokenStorage } = await import('./tokenStorage');

        await expect(TokenStorage.getCredentials()).resolves.toEqual(credentials);
        await expect(TokenStorage.setCredentials(credentials)).resolves.toBe(true);
        await expect(TokenStorage.removeCredentials()).resolves.toBe(true);

        expect(tauriStorage.getCredentials).toHaveBeenCalledOnce();
        expect(tauriStorage.setCredentials).toHaveBeenCalledWith(credentials);
        expect(tauriStorage.removeCredentials).toHaveBeenCalledOnce();
        expect(secureStore.getItemAsync).not.toHaveBeenCalled();
        expect(secureStore.setItemAsync).not.toHaveBeenCalled();
        expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('restores Tauri credentials after a WebView restart and stays logged out after removal', async () => {
        tauriRuntime.active = true;
        let keyringCredentials: typeof credentials | null = credentials;
        tauriStorage.getCredentials.mockImplementation(async () => keyringCredentials);
        tauriStorage.setCredentials.mockImplementation(async (nextCredentials) => {
            keyringCredentials = nextCredentials;
            return true;
        });
        tauriStorage.removeCredentials.mockImplementation(async () => {
            keyringCredentials = null;
            return true;
        });

        const firstWebView = await import('./tokenStorage');
        await expect(firstWebView.TokenStorage.getCredentials()).resolves.toEqual(credentials);

        vi.resetModules();
        const restartedWebView = await import('./tokenStorage');
        await expect(restartedWebView.TokenStorage.getCredentials()).resolves.toEqual(credentials);
        await expect(restartedWebView.TokenStorage.removeCredentials()).resolves.toBe(true);

        vi.resetModules();
        const loggedOutWebView = await import('./tokenStorage');
        await expect(loggedOutWebView.TokenStorage.getCredentials()).resolves.toBeNull();
        expect(tauriStorage.removeCredentials).toHaveBeenCalledOnce();
        expect(secureStore.getItemAsync).not.toHaveBeenCalled();
        expect(secureStore.setItemAsync).not.toHaveBeenCalled();
        expect(secureStore.deleteItemAsync).not.toHaveBeenCalled();
    });

    it('continues using the operating-system secure store on native platforms', async () => {
        platform.OS = 'ios';
        secureStore.getItemAsync.mockResolvedValue(JSON.stringify(credentials));
        const { TokenStorage } = await import('./tokenStorage');

        await expect(TokenStorage.getCredentials()).resolves.toEqual(credentials);
        await expect(TokenStorage.setCredentials(credentials)).resolves.toBe(true);
        await expect(TokenStorage.removeCredentials()).resolves.toBe(true);

        expect(secureStore.getItemAsync).toHaveBeenCalledWith('auth_credentials');
        expect(secureStore.setItemAsync).toHaveBeenCalledWith('auth_credentials', JSON.stringify(credentials));
        expect(secureStore.deleteItemAsync).toHaveBeenCalledWith('auth_credentials');
    });
});
