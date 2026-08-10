import { decodeAccountSettingsUpdate } from './accountSettingsUpdate';
import type { Settings } from './settings';

export type AccountSettingsSnapshot = {
    value: string | null;
    version: number;
};

/** Decode a settings snapshot while keeping the server version/default semantics in one place. */
export async function decodeAccountSettingsSnapshot(params: {
    value: AccountSettingsSnapshot['value'];
    version: AccountSettingsSnapshot['version'];
    defaults: Settings;
    decrypt: (value: string) => Promise<unknown>;
}): Promise<{ settings: Settings; version: number }> {
    if (!params.value) {
        return { settings: { ...params.defaults }, version: params.version };
    }

    const decoded = await decodeAccountSettingsUpdate({
        value: params.value,
        version: params.version,
        decrypt: params.decrypt,
    });
    return { settings: decoded.settings, version: decoded.version };
}
