import { useCallback, useEffect, useState } from 'react';
import { AppState, AppStateStatus, DevSettings, Platform } from 'react-native';

type ExpoUpdatesModule = typeof import('expo-updates');
export type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'restarting';
export type UpdateCheckResult = 'available' | 'none' | 'unavailable' | 'error';
type CheckForUpdatesOptions = {
    silent?: boolean;
};

type UpdateSnapshot = {
    updateAvailable: boolean;
    isChecking: boolean;
    isDownloading: boolean;
    updateStatus: UpdateStatus;
};

const listeners = new Set<() => void>();
let initialized = false;
let appState: AppStateStatus = Platform.OS === 'web' ? 'active' : AppState.currentState;
let inFlightCheck: Promise<UpdateCheckResult> | null = null;
let snapshot: UpdateSnapshot = {
    updateAvailable: false,
    isChecking: false,
    isDownloading: false,
    updateStatus: 'idle',
};

function setSnapshot(next: Partial<UpdateSnapshot>) {
    snapshot = { ...snapshot, ...next };
    listeners.forEach(listener => listener());
}

async function getExpoUpdates(): Promise<ExpoUpdatesModule | null> {
    if (Platform.OS === 'web') return null;

    try {
        return await import('expo-updates');
    } catch (error) {
        console.warn('expo-updates is not available:', error);
        return null;
    }
}

async function runUpdateCheck(options: CheckForUpdatesOptions = {}): Promise<UpdateCheckResult> {
    if (Platform.OS === 'web') return 'unavailable';
    if (snapshot.updateStatus === 'ready' || snapshot.updateStatus === 'restarting') return 'available';
    if (inFlightCheck) {
        if (!options.silent) {
            setSnapshot({
                isChecking: true,
                updateStatus: 'checking',
            });
        }
        return inFlightCheck;
    }

    inFlightCheck = (async () => {
        try {
            const Updates = await getExpoUpdates();
            if (!Updates?.isEnabled) return 'unavailable';

            if (!options.silent) {
                setSnapshot({
                    isChecking: true,
                    updateStatus: 'checking',
                });
            }

            const update = await Updates.checkForUpdateAsync();
            if (!update.isAvailable) {
                setSnapshot({
                    updateAvailable: false,
                    isChecking: false,
                    updateStatus: 'idle',
                });
                return 'none';
            }

            setSnapshot({
                isChecking: false,
                isDownloading: true,
                updateStatus: 'downloading',
            });

            const fetchedUpdate = await Updates.fetchUpdateAsync();
            setSnapshot({
                updateAvailable: fetchedUpdate.isNew,
                updateStatus: fetchedUpdate.isNew ? 'ready' : 'idle',
            });
            return fetchedUpdate.isNew ? 'available' : 'none';
        } catch (error) {
            console.warn('Failed to check for OTA updates:', error);
            setSnapshot({
                updateStatus: 'idle',
            });
            return 'error';
        } finally {
            setSnapshot({
                isDownloading: false,
                isChecking: false,
            });
            inFlightCheck = null;
        }
    })();

    return inFlightCheck;
}

function ensureUpdatesInitialized() {
    if (initialized) return;
    initialized = true;

    void runUpdateCheck({ silent: true });

    if (Platform.OS === 'web') return;

    AppState.addEventListener('change', (nextAppState) => {
        const wasBackgrounded = appState === 'background' || appState === 'inactive';
        appState = nextAppState;

        if (wasBackgrounded && nextAppState === 'active') {
            void runUpdateCheck({ silent: true });
        }
    });
}

function subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export function useUpdates() {
    const [currentSnapshot, setCurrentSnapshot] = useState(snapshot);

    const checkForUpdates = useCallback((options?: CheckForUpdatesOptions) => {
        return runUpdateCheck(options);
    }, []);

    useEffect(() => {
        ensureUpdatesInitialized();
        return subscribe(() => {
            setCurrentSnapshot(snapshot);
        });
    }, []);

    const reloadApp = useCallback(async () => {
        if (Platform.OS === 'web') {
            window.location.reload();
            return;
        }

        const Updates = await getExpoUpdates();
        if (Updates?.isEnabled) {
            setSnapshot({ updateStatus: 'restarting' });
            await Updates.reloadAsync();
            return;
        }

        DevSettings.reload();
    }, []);

    return {
        updateAvailable: currentSnapshot.updateAvailable,
        isChecking: currentSnapshot.isChecking,
        isDownloading: currentSnapshot.isDownloading,
        updateStatus: currentSnapshot.updateStatus,
        checkForUpdates,
        reloadApp,
    };
}
