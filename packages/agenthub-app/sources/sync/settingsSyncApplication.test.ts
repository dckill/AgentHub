import { describe, expect, it, vi } from 'vitest';
import type { Settings } from './settings';
import { runSettingsSyncApplication } from './settingsSyncApplication';

const baseSettings = { viewInline: false } as Settings;

describe('settings sync application', () => {
    it('flushes pending edits before fetching and applying the authoritative snapshot', async () => {
        const pending = { viewInline: true } as Partial<Settings>;
        const events: string[] = [];
        const applyServerSettings = vi.fn((settings: Settings, version: number) => {
            events.push(`apply:${settings.viewInline}:${version}`);
        });

        await runSettingsSyncApplication({
            pendingSettings: pending,
            currentSettings: baseSettings,
            currentVersion: 3,
            getPendingSettings: () => pending,
            setPendingSettings: () => events.push('clear-pending'),
            encryptSettings: async () => 'encrypted',
            postSettings: async () => {
                events.push('post');
                return { success: true as const };
            },
            fetchSettings: async () => {
                events.push('get');
                return { settings: 'server', settingsVersion: 4 };
            },
            decodeServerSettings: async (value, version) => ({
                settings: { ...baseSettings, viewInline: value === 'server' } as Settings,
                version,
            }),
            applyServerSettings,
            savePendingSettings: () => events.push('save-pending'),
            assertCurrent: vi.fn(),
            runRequest: async (operation) => operation({ signal: new AbortController().signal }),
        });

        expect(events).toEqual(['post', 'clear-pending', 'save-pending', 'get', 'apply:true:4']);
        expect(applyServerSettings).toHaveBeenCalledWith({ ...baseSettings, viewInline: true }, 4);
    });

    it('does not apply a snapshot when the account generation is stale', async () => {
        const applyServerSettings = vi.fn();
        const assertCurrent = vi.fn(() => {
            throw new DOMException('Account lifecycle is stale', 'AbortError');
        });

        await expect(runSettingsSyncApplication({
            pendingSettings: {},
            currentSettings: baseSettings,
            currentVersion: 3,
            getPendingSettings: () => ({}),
            setPendingSettings: vi.fn(),
            encryptSettings: vi.fn(),
            postSettings: vi.fn(),
            fetchSettings: async () => ({ settings: 'server', settingsVersion: 4 }),
            decodeServerSettings: async () => ({ settings: baseSettings, version: 4 }),
            applyServerSettings,
            savePendingSettings: vi.fn(),
            assertCurrent,
            runRequest: async (operation) => operation({ signal: new AbortController().signal }),
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(applyServerSettings).not.toHaveBeenCalled();
    });
});
