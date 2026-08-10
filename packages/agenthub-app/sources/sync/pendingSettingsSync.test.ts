import { describe, expect, it, vi } from 'vitest';

import { settingsDefaults, type Settings } from './settings';
import { syncPendingSettings, type PendingSettingsSyncResponse } from './pendingSettingsSync';

const responseOk = (): PendingSettingsSyncResponse => ({ success: true });

describe('syncPendingSettings', () => {
    it('preserves local changes made while the request is in flight', async () => {
        let currentPending: Partial<Settings> = { viewInline: true };
        const setPendingSettings = vi.fn((next: Partial<Settings>) => { currentPending = next; });
        const encryptSettings = vi.fn().mockResolvedValue('encrypted-dark');
        const postSettings = vi.fn(async () => {
            currentPending = { ...currentPending, preferredLanguage: 'zh-Hans' };
            return responseOk();
        });

        await syncPendingSettings({
            pendingSettings: currentPending,
            currentSettings: settingsDefaults,
            currentVersion: 3,
            getPendingSettings: () => currentPending,
            setPendingSettings,
            encryptSettings,
            postSettings,
            decodeServerSettings: vi.fn(),
            applyServerSettings: vi.fn(),
            savePendingSettings: vi.fn(),
            assertCurrent: vi.fn(),
        });

        expect(encryptSettings).toHaveBeenCalledWith(expect.objectContaining({ viewInline: true }));
        expect(postSettings).toHaveBeenCalledWith('encrypted-dark', 3);
        expect(setPendingSettings).toHaveBeenCalledWith({ preferredLanguage: 'zh-Hans' });
    });

    it('merges server settings on version conflict and retries with local changes winning', async () => {
        const currentPending: Partial<Settings> = { viewInline: true };
        const encryptSettings = vi.fn()
            .mockResolvedValueOnce('encrypted-first')
            .mockResolvedValueOnce('encrypted-retry');
        const postSettings = vi.fn()
            .mockResolvedValueOnce({
                success: false,
                error: 'version-mismatch',
                currentVersion: 4,
                currentSettings: 'server-settings',
            } satisfies PendingSettingsSyncResponse)
            .mockResolvedValueOnce(responseOk());
        const applyServerSettings = vi.fn();

        await syncPendingSettings({
            pendingSettings: currentPending,
            currentSettings: settingsDefaults,
            currentVersion: 3,
            getPendingSettings: () => currentPending,
            setPendingSettings: vi.fn(),
            encryptSettings,
            postSettings,
            decodeServerSettings: vi.fn().mockResolvedValue({ ...settingsDefaults, preferredLanguage: 'en' }),
            applyServerSettings,
            savePendingSettings: vi.fn(),
            assertCurrent: vi.fn(),
        });

        expect(postSettings).toHaveBeenNthCalledWith(2, 'encrypted-retry', 4);
        expect(encryptSettings).toHaveBeenNthCalledWith(2, expect.objectContaining({
            viewInline: true,
            preferredLanguage: 'en',
        }));
        expect(applyServerSettings).toHaveBeenCalledWith(expect.objectContaining({ preferredLanguage: 'en' }), 4);
    });

    it('rethrows non-conflict failures and stops after the conflict retry budget', async () => {
        const pending = { viewInline: true } satisfies Partial<Settings>;
        const base = {
            pendingSettings: pending,
            currentSettings: settingsDefaults,
            currentVersion: 3,
            getPendingSettings: () => pending,
            setPendingSettings: vi.fn(),
            encryptSettings: vi.fn().mockResolvedValue('encrypted'),
            decodeServerSettings: vi.fn().mockResolvedValue(settingsDefaults),
            applyServerSettings: vi.fn(),
            savePendingSettings: vi.fn(),
            assertCurrent: vi.fn(),
        };

        await expect(syncPendingSettings({
            ...base,
            postSettings: vi.fn().mockResolvedValue({ success: false, error: 'server-error', currentVersion: 3, currentSettings: null }),
        })).rejects.toThrow('Failed to sync settings: server-error');

        await expect(syncPendingSettings({
            ...base,
            postSettings: vi.fn().mockResolvedValue({ success: false, error: 'version-mismatch', currentVersion: 4, currentSettings: 'server' }),
        })).rejects.toThrow('Settings sync failed after 3 retries due to version conflicts');
    });
});
