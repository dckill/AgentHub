import { applySettings, type Settings } from './settings';

export type ServerSettingsApplicationParams = {
    serverSettings: Settings;
    version: number;
    pendingSettings: Partial<Settings>;
    apply: (settings: Settings, version: number) => void;
};

/** Apply an authoritative settings snapshot without discarding local pending edits. */
export function applyServerSettings(params: ServerSettingsApplicationParams): void {
    const merged = Object.keys(params.pendingSettings).length > 0
        ? applySettings(params.serverSettings, params.pendingSettings)
        : params.serverSettings;
    params.apply(merged, params.version);
}
