import { describe, expect, it, vi } from 'vitest';
import { decodeAccountSettingsUpdate } from './accountSettingsUpdate';

describe('decodeAccountSettingsUpdate', () => {
    it('decrypts and parses settings while preserving the server version', async () => {
        const decrypt = vi.fn().mockResolvedValue({ viewInline: true, schemaVersion: 2 });

        await expect(decodeAccountSettingsUpdate({
            value: 'encrypted-settings',
            version: 7,
            decrypt,
        })).resolves.toMatchObject({
            version: 7,
            schemaVersion: 2,
            settings: expect.objectContaining({ viewInline: true }),
        });
        expect(decrypt).toHaveBeenCalledWith('encrypted-settings');
    });

    it('defaults missing schema versions to the legacy version', async () => {
        await expect(decodeAccountSettingsUpdate({
            value: 'encrypted-settings',
            version: 1,
            decrypt: async () => ({ viewInline: false }),
        })).resolves.toMatchObject({ schemaVersion: 1 });
    });
});
