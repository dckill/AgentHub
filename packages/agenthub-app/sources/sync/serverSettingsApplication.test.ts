import { describe, expect, it, vi } from 'vitest';
import { applyServerSettings } from './serverSettingsApplication';
import { settingsDefaults, type Settings } from './settings';

describe('applyServerSettings', () => {
    it('merges pending local changes over the server snapshot before applying', () => {
        const apply = vi.fn();
        const serverSettings: Settings = { ...settingsDefaults, viewInline: true };

        applyServerSettings({
            serverSettings,
            version: 7,
            pendingSettings: { viewInline: false },
            apply,
        });

        expect(apply).toHaveBeenCalledWith(
            expect.objectContaining({ viewInline: false }),
            7,
        );
    });

    it('applies the server object by reference when there are no pending changes', () => {
        const apply = vi.fn();
        const serverSettings: Settings = { ...settingsDefaults, expandTodos: false };

        applyServerSettings({
            serverSettings,
            version: 8,
            pendingSettings: {},
            apply,
        });

        expect(apply).toHaveBeenCalledWith(serverSettings, 8);
    });
});
