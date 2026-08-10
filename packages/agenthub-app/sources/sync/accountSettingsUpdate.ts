import { settingsParse, type Settings } from './settings';

export type DecodeAccountSettingsUpdateParams = {
    value: string;
    version: number;
    decrypt: (value: string) => Promise<unknown>;
};

export type DecodedAccountSettingsUpdate = {
    settings: Settings;
    version: number;
    /** The schema version observed on the wire, before defaults are merged. */
    schemaVersion: number;
};

/** Decrypt and normalize an account settings update without applying it. */
export async function decodeAccountSettingsUpdate(
    params: DecodeAccountSettingsUpdateParams,
): Promise<DecodedAccountSettingsUpdate> {
    const decrypted = await params.decrypt(params.value);
    const schemaVersion = (
        decrypted && typeof decrypted === 'object' && 'schemaVersion' in decrypted
        && typeof decrypted.schemaVersion === 'number'
    ) ? decrypted.schemaVersion : 1;

    return {
        settings: settingsParse(decrypted),
        version: params.version,
        schemaVersion,
    };
}
