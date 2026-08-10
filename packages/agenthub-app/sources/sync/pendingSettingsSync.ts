import { applySettings, type Settings } from './settings';
import { retainConcurrentPendingSettings } from './pendingSettingsReconciliation';

export type PendingSettingsSyncResponse =
    | { success: true }
    | {
        success: false;
        error: string;
        currentVersion: number;
        currentSettings: string | null;
    };

export type PendingSettingsSyncParams = {
    pendingSettings: Partial<Settings>;
    currentSettings: Settings;
    currentVersion: number;
    maxRetries?: number;
    getPendingSettings: () => Partial<Settings>;
    setPendingSettings: (settings: Partial<Settings>) => void;
    encryptSettings: (settings: Settings) => Promise<string>;
    postSettings: (encryptedSettings: string, expectedVersion: number) => Promise<PendingSettingsSyncResponse>;
    decodeServerSettings: (value: string | null, version: number) => Promise<Settings>;
    applyServerSettings: (settings: Settings, version: number) => void;
    savePendingSettings: (settings: Partial<Settings>) => void;
    assertCurrent: () => void;
};

/**
 * Flush pending account settings while preserving concurrent local edits.
 * Network, encryption and storage are injected so the version-conflict state
 * machine can be tested without constructing the full Sync coordinator.
 */
export async function syncPendingSettings(params: PendingSettingsSyncParams): Promise<void> {
    const maxRetries = params.maxRetries ?? 3;
    if (Object.keys(params.pendingSettings).length === 0) {
        return;
    }

    let retryCount = 0;
    let settings = params.currentSettings;
    let version = params.currentVersion;

    while (retryCount < maxRetries) {
        const sentPending = { ...params.getPendingSettings() };
        settings = applySettings(settings, sentPending);
        const encryptedSettings = await params.encryptSettings(settings);
        params.assertCurrent();
        const data = await params.postSettings(encryptedSettings, version);

        if (data.success) {
            params.assertCurrent();
            const retainedPending = retainConcurrentPendingSettings(
                sentPending,
                params.getPendingSettings(),
            );
            params.setPendingSettings(retainedPending);
            params.savePendingSettings(retainedPending);
            return;
        }

        if (data.error !== 'version-mismatch') {
            throw new Error(`Failed to sync settings: ${data.error}`);
        }

        const serverSettings = await params.decodeServerSettings(
            data.currentSettings,
            data.currentVersion,
        );
        params.assertCurrent();
        version = data.currentVersion;
        settings = applySettings(serverSettings, params.getPendingSettings());
        params.applyServerSettings(settings, version);
        retryCount += 1;
    }

    throw new Error(`Settings sync failed after ${maxRetries} retries due to version conflicts`);
}
