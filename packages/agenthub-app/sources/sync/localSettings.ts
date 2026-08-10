import * as z from 'zod';

//
// Schema
//

export const LocalSettingsSchema = z.object({
    // Developer settings (device-specific)
    debugMode: z.boolean().describe('Enable debug logging'),
    devModeEnabled: z.boolean().describe('Enable developer menu in settings'),
    commandPaletteEnabled: z.boolean().describe('Enable CMD+K command palette (web only)'),
    themePreference: z.enum(['light', 'dark', 'adaptive']).describe('Theme preference: light, dark, or adaptive (follows system)'),
    markdownCopyV2: z.boolean().describe('Replace native paragraph selection with long-press modal for full markdown copy'),
    consoleLoggingEnabled: z.boolean().describe('Enable console output in production builds'),
    verboseLogging: z.boolean().describe('Log all network requests and responses'),
    sidebarCollapsed: z.boolean().describe('Whether the right file-diffs sidebar is collapsed on desktop'),
    sidebarPanelsOpen: z.array(z.enum(['changes', 'allFiles', 'sideChat'])).describe('Open session workbench panels'),
    sidebarPanelActive: z.enum(['changes', 'allFiles', 'sideChat']).nullable().describe('Active session workbench panel'),
    // Scale multipliers (1.0 = default/largest, 0.5 = smallest)
    sessionListScale: z.number().min(0.5).max(1.0).describe('Session list scale multiplier'),
    chatScale: z.number().min(0.5).max(1.0).describe('Chat page scale multiplier'),
    fileScale: z.number().min(0.5).max(1.0).describe('File preview scale multiplier'),
    fileListScale: z.number().min(0.5).max(1.0).describe('File list scale multiplier'),
    deviceScale: z.number().min(0.5).max(1.0).describe('Device list scale multiplier'),
    settingsScale: z.number().min(0.5).max(1.0).describe('Settings page scale multiplier'),
    // CLI version acknowledgments - keyed by machineId
    acknowledgedCliVersions: z.record(z.string(), z.string()).describe('Acknowledged CLI versions per machine'),
});

//
// NOTE: Local settings are device-specific and should NOT be synced.
// These are preferences that make sense to be different on each device.
//

const LocalSettingsSchemaPartial = LocalSettingsSchema.passthrough().partial();

export type LocalSettings = z.infer<typeof LocalSettingsSchema>;

//
// Defaults
//

export const localSettingsDefaults: LocalSettings = {
    debugMode: false,
    devModeEnabled: false,
    commandPaletteEnabled: false,
    themePreference: 'adaptive',
    markdownCopyV2: false,
    consoleLoggingEnabled: false,
    verboseLogging: false,
    sidebarCollapsed: false,
    sidebarPanelsOpen: ['changes'],
    sidebarPanelActive: 'changes',
    sessionListScale: 1.0,
    chatScale: 1.0,
    fileScale: 1.0,
    fileListScale: 1.0,
    deviceScale: 1.0,
    settingsScale: 1.0,
    acknowledgedCliVersions: {},
};
Object.freeze(localSettingsDefaults);

//
// Parsing
//

export function localSettingsParse(settings: unknown): LocalSettings {
    const parsed = LocalSettingsSchemaPartial.safeParse(settings);
    if (!parsed.success) {
        return { ...localSettingsDefaults };
    }
    return { ...localSettingsDefaults, ...parsed.data };
}

//
// Applying changes
//

export function applyLocalSettings(settings: LocalSettings, delta: Partial<LocalSettings>): LocalSettings {
    return { ...localSettingsDefaults, ...settings, ...delta };
}
