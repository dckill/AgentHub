import { describe, expect, it, vi } from 'vitest';
import type { Profile } from './profile';
import { applyAccountUpdate } from './accountUpdateApplication';

const profile: Profile = {
    id: 'account-1',
    timestamp: 10,
    firstName: '旧名',
    lastName: '用户',
    avatar: null,
};

describe('applyAccountUpdate', () => {
    it('applies the profile and decrypted settings through explicit boundaries', async () => {
        const applyProfile = vi.fn();
        const applySettings = vi.fn();
        const assertCurrent = vi.fn();

        await expect(applyAccountUpdate({
            currentProfile: profile,
            accountUpdate: {
                t: 'update-account',
                id: 'account-1',
                firstName: '新名',
                settings: { value: 'encrypted', version: 7 },
            },
            timestamp: 20,
            decryptSettings: async () => ({ viewInline: true, schemaVersion: 2 }),
            assertCurrent,
            applyProfile,
            applySettings,
            onUnsupportedSchema: vi.fn(),
            onSettingsError: vi.fn(),
        })).resolves.toEqual({ schemaVersion: 2, settingsApplied: true });

        expect(applyProfile).toHaveBeenCalledWith({ ...profile, firstName: '新名', timestamp: 20 });
        expect(applySettings).toHaveBeenCalledWith(expect.objectContaining({ viewInline: true }), 7);
        expect(assertCurrent).toHaveBeenCalledTimes(1);
    });

    it('keeps profile updates when settings decryption fails', async () => {
        const applyProfile = vi.fn();
        const onSettingsError = vi.fn();

        await expect(applyAccountUpdate({
            currentProfile: profile,
            accountUpdate: { t: 'update-account', id: 'account-1', lastName: '新用户', settings: { value: 'bad', version: 8 } },
            timestamp: 30,
            decryptSettings: async () => { throw new Error('decrypt failed'); },
            assertCurrent: vi.fn(),
            applyProfile,
            applySettings: vi.fn(),
            onUnsupportedSchema: vi.fn(),
            onSettingsError,
        })).resolves.toEqual({ settingsApplied: false });

        expect(applyProfile).toHaveBeenCalledWith({ ...profile, lastName: '新用户', timestamp: 30 });
        expect(onSettingsError).toHaveBeenCalledWith(expect.any(Error));
    });

    it('reports newer schemas without blocking compatible settings', async () => {
        const onUnsupportedSchema = vi.fn();
        const applySettings = vi.fn();

        await applyAccountUpdate({
            currentProfile: profile,
            accountUpdate: { t: 'update-account', id: 'account-1', settings: { value: 'future', version: 9 } },
            timestamp: 40,
            decryptSettings: async () => ({ schemaVersion: 99, viewInline: false }),
            assertCurrent: vi.fn(),
            applyProfile: vi.fn(),
            applySettings,
            onUnsupportedSchema,
            onSettingsError: vi.fn(),
        });

        expect(onUnsupportedSchema).toHaveBeenCalledWith(99);
        expect(applySettings).toHaveBeenCalledWith(expect.objectContaining({ viewInline: false }), 9);
    });
});
