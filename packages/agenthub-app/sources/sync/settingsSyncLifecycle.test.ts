import { describe, expect, it, vi } from 'vitest';
import { runSettingsSyncLifecycle } from './settingsSyncLifecycle';
import type { SettingsSyncLifecycleOptions } from './settingsSyncLifecycle';

const baseOptions = () => ({
    generation: 2,
    pendingSettings: {},
    currentSettings: { language: 'en' } as never,
    currentVersion: 3,
    getPendingSettings: () => ({}),
    setPendingSettings: vi.fn(),
    encryptSettings: vi.fn(async () => 'encrypted-settings'),
    postSettings: vi.fn(async () => ({ success: true as const })),
    fetchSettings: vi.fn(async () => ({ settings: null, settingsVersion: 4 })),
    decodeServerSettings: vi.fn(async (_value: string | null, version: number) => ({
        settings: { language: 'zh' } as never,
        version,
    })),
    applyServerSettings: vi.fn(),
    savePendingSettings: vi.fn(),
    assertCurrent: vi.fn(),
});

describe('settings sync lifecycle', () => {
    it('keeps account generation on pending settings writes and snapshot fetch', async () => {
        const options = baseOptions();
        const runRequestMock = vi.fn(async <T>(_generation: number, operation: (request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<T>): Promise<T> => operation({
            signal: new AbortController().signal,
            assertCurrent: vi.fn(),
        }));
        const runRequest = runRequestMock as unknown as SettingsSyncLifecycleOptions['runRequest'];

        await runSettingsSyncLifecycle({
            ...options,
            pendingSettings: { language: 'zh' } as never,
            runRequest,
        });

        expect(runRequestMock).toHaveBeenCalledWith(2, expect.any(Function));
        expect(options.fetchSettings).toHaveBeenCalled();
        expect(options.applyServerSettings).toHaveBeenCalledWith({ language: 'zh' }, 4);
    });

    it('propagates snapshot decode failures without applying a partial settings state', async () => {
        const options = baseOptions();
        options.decodeServerSettings.mockRejectedValueOnce(new Error('decrypt failed'));
        const runRequest = async <T>(_generation: number, operation: (request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<T>): Promise<T> => operation({
            signal: new AbortController().signal,
            assertCurrent: vi.fn(),
        });

        await expect(runSettingsSyncLifecycle({ ...options, runRequest })).rejects.toThrow('decrypt failed');
        expect(options.applyServerSettings).not.toHaveBeenCalled();
    });
});
