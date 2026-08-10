import { describe, expect, it, vi } from 'vitest';
import { settingsDefaults } from './settings';
import { decodeAccountSettingsSnapshot } from './accountSettingsSnapshot';

describe('decodeAccountSettingsSnapshot', () => {
    it('uses the parsed encrypted settings and preserves the server version', async () => {
        const decrypt = vi.fn().mockResolvedValue({ viewInline: true, schemaVersion: 2 });

        await expect(decodeAccountSettingsSnapshot({
            value: 'encrypted-settings',
            version: 7,
            defaults: settingsDefaults,
            decrypt,
        })).resolves.toMatchObject({
            version: 7,
            settings: expect.objectContaining({ viewInline: true }),
        });
        expect(decrypt).toHaveBeenCalledWith('encrypted-settings');
    });

    it('returns a fresh defaults object when the server has no settings payload', async () => {
        const result = await decodeAccountSettingsSnapshot({
            value: null,
            version: 3,
            defaults: settingsDefaults,
            decrypt: vi.fn(),
        });

        expect(result).toEqual({ settings: settingsDefaults, version: 3 });
        expect(result.settings).not.toBe(settingsDefaults);
    });
});
