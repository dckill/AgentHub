import { syncPendingSettings, type PendingSettingsSyncResponse } from './pendingSettingsSync';
import type { Settings } from './settings';

export type SettingsSyncRequest = { signal: AbortSignal };

export type SettingsSnapshotResponse = {
    settings: string | null;
    settingsVersion: number;
};

export type SettingsSyncApplicationParams<Request extends SettingsSyncRequest = SettingsSyncRequest> = {
    pendingSettings: Partial<Settings>;
    currentSettings: Settings;
    currentVersion: number;
    getPendingSettings: () => Partial<Settings>;
    setPendingSettings: (settings: Partial<Settings>) => void;
    encryptSettings: (settings: Settings) => Promise<string>;
    postSettings: (
        encryptedSettings: string,
        expectedVersion: number,
        request: Request,
    ) => Promise<PendingSettingsSyncResponse>;
    fetchSettings: (request: Request) => Promise<SettingsSnapshotResponse>;
    decodeServerSettings: (
        value: string | null,
        version: number,
    ) => Promise<{ settings: Settings; version: number }>;
    applyServerSettings: (settings: Settings, version: number) => void;
    savePendingSettings: (settings: Partial<Settings>) => void;
    assertCurrent: () => void;
    runRequest: <T>(operation: (request: Request) => Promise<T>) => Promise<T>;
};

/** Flush local settings and apply the latest server snapshot within one account lifecycle. */
export async function runSettingsSyncApplication<
    Request extends SettingsSyncRequest,
>(params: SettingsSyncApplicationParams<Request>): Promise<void> {
    if (Object.keys(params.pendingSettings).length > 0) {
        await syncPendingSettings({
            pendingSettings: params.pendingSettings,
            currentSettings: params.currentSettings,
            currentVersion: params.currentVersion,
            getPendingSettings: params.getPendingSettings,
            setPendingSettings: params.setPendingSettings,
            encryptSettings: params.encryptSettings,
            postSettings: (encryptedSettings, expectedVersion) => params.runRequest((request) => (
                params.postSettings(encryptedSettings, expectedVersion, request)
            )),
            decodeServerSettings: async (value, version) => (
                await params.decodeServerSettings(value, version)
            ).settings,
            applyServerSettings: params.applyServerSettings,
            savePendingSettings: params.savePendingSettings,
            assertCurrent: params.assertCurrent,
        });
    }

    const data = await params.runRequest(params.fetchSettings);
    const decoded = await params.decodeServerSettings(data.settings, data.settingsVersion);
    params.assertCurrent();
    params.applyServerSettings(decoded.settings, data.settingsVersion);
}
