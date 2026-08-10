import type { ApiUpdate } from './apiTypes';
import type { Profile } from './profile';
import { SUPPORTED_SCHEMA_VERSION, type Settings } from './settings';
import { buildUpdatedProfile } from './accountUpdateProjection';
import { decodeAccountSettingsUpdate } from './accountSettingsUpdate';

type AccountUpdate = Extract<ApiUpdate, { t: 'update-account' }>;

export type ApplyAccountUpdateParams = {
    currentProfile: Profile;
    accountUpdate: AccountUpdate;
    timestamp: number;
    decryptSettings: (value: string) => Promise<unknown>;
    assertCurrent: () => void;
    applyProfile: (profile: Profile) => void;
    applySettings: (settings: Settings, version: number) => void;
    onUnsupportedSchema: (schemaVersion: number) => void;
    onSettingsError: (error: unknown) => void;
};

export type ApplyAccountUpdateResult = {
    schemaVersion?: number;
    settingsApplied: boolean;
};

/**
 * Apply the account profile update and isolate best-effort encrypted settings
 * handling from the realtime Sync dispatcher.
 */
export async function applyAccountUpdate(
    params: ApplyAccountUpdateParams,
): Promise<ApplyAccountUpdateResult> {
    params.applyProfile(buildUpdatedProfile(
        params.currentProfile,
        params.accountUpdate,
        params.timestamp,
    ));

    const settingsUpdate = params.accountUpdate.settings;
    if (!settingsUpdate?.value) {
        return { settingsApplied: false };
    }

    try {
        const decodedSettings = await decodeAccountSettingsUpdate({
            value: settingsUpdate.value,
            version: settingsUpdate.version,
            decrypt: params.decryptSettings,
        });
        params.assertCurrent();

        if (decodedSettings.schemaVersion > SUPPORTED_SCHEMA_VERSION) {
            params.onUnsupportedSchema(decodedSettings.schemaVersion);
        }

        params.applySettings(decodedSettings.settings, decodedSettings.version);
        return {
            schemaVersion: decodedSettings.schemaVersion,
            settingsApplied: true,
        };
    } catch (error) {
        params.assertCurrent();
        params.onSettingsError(error);
        return { settingsApplied: false };
    }
}
