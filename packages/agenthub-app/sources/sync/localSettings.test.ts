import { describe, expect, it } from 'vitest';
import { applyLocalSettings, localSettingsDefaults, localSettingsParse } from './localSettings';

describe('localSettings', () => {
    it('fills new scale defaults for partial persisted settings', () => {
        expect(localSettingsParse({ debugMode: true })).toMatchObject({
            debugMode: true,
            sessionListScale: 1,
            chatScale: 1,
            fileScale: 1,
            fileListScale: 1,
            deviceScale: 1,
            settingsScale: 1,
        });
    });

    it('rejects invalid scale values by returning defaults', () => {
        expect(localSettingsParse({ sessionListScale: 2 })).toEqual(localSettingsDefaults);
        expect(localSettingsParse({ chatScale: 0.1 })).toEqual(localSettingsDefaults);
        expect(localSettingsParse({ fileListScale: 2 })).toEqual(localSettingsDefaults);
        expect(localSettingsParse({ deviceScale: 0.1 })).toEqual(localSettingsDefaults);
        expect(localSettingsParse({ settingsScale: 2 })).toEqual(localSettingsDefaults);
    });

    it('applies deltas without mutating defaults', () => {
        const next = applyLocalSettings(localSettingsDefaults, { fileScale: 0.7, sidebarCollapsed: true });

        expect(next).toMatchObject({ fileScale: 0.7, sidebarCollapsed: true });
        expect(localSettingsDefaults.fileScale).toBe(1);
        expect(Object.isFrozen(localSettingsDefaults)).toBe(true);
    });
});
