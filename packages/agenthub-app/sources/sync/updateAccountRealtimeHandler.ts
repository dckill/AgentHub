import type { ApiUpdate } from './apiTypes';
import { applyAccountUpdate } from './accountUpdateApplication';
import { SUPPORTED_SCHEMA_VERSION } from './settings';

type AccountUpdate = Extract<ApiUpdate, { t: 'update-account' }>;
type AccountUpdateParams = Parameters<typeof applyAccountUpdate>[0];
type AccountUpdateResult = Awaited<ReturnType<typeof applyAccountUpdate>>;

export type UpdateAccountRealtimeHandlerParams = Omit<
    AccountUpdateParams,
    'applyProfile' | 'applySettings' | 'onUnsupportedSchema' | 'onSettingsError'
> & {
    applyProfile: AccountUpdateParams['applyProfile'];
    applySettings: AccountUpdateParams['applySettings'];
    invalidateSettings: () => void;
    log: (message: string) => void;
    logError: (message: string, error?: unknown) => void;
    warn: (message: string) => void;
    applyUpdate?: (params: AccountUpdateParams) => Promise<AccountUpdateResult>;
};

/** Apply one realtime account update and isolate settings recovery side effects. */
export async function handleUpdateAccountRealtime(
    params: UpdateAccountRealtimeHandlerParams,
): Promise<AccountUpdateResult> {
    const applyUpdate = params.applyUpdate ?? applyAccountUpdate;
    return applyUpdate({
        currentProfile: params.currentProfile,
        accountUpdate: params.accountUpdate,
        timestamp: params.timestamp,
        decryptSettings: params.decryptSettings,
        assertCurrent: params.assertCurrent,
        applyProfile: params.applyProfile,
        applySettings: (settings, version) => {
            params.applySettings(settings, version);
            params.log(`📋 Settings synced from server (schema v${settings.schemaVersion}, version ${params.accountUpdate.settings?.version})`);
        },
        onUnsupportedSchema: (schemaVersion) => {
            params.warn(
                `⚠️ Received settings schema v${schemaVersion}, ` +
                `we support v${SUPPORTED_SCHEMA_VERSION}. Update app for full functionality.`,
            );
        },
        onSettingsError: (error) => {
            params.logError('❌ Failed to process settings update:', error);
            params.invalidateSettings();
        },
    });
}
