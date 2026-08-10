import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { Profile } from './profile';
import { handleUpdateAccountRealtime } from './updateAccountRealtimeHandler';

type AccountUpdate = Extract<ApiUpdate, { t: 'update-account' }>;
const profile: Profile = { id: 'account-1', timestamp: 10, firstName: '旧名', lastName: '用户', avatar: null };
const accountUpdate: AccountUpdate = {
    t: 'update-account', id: 'account-1', firstName: '新名', settings: { value: 'encrypted', version: 7 },
};

function createParams(overrides: Record<string, unknown> = {}) {
    return {
        currentProfile: profile,
        accountUpdate,
        timestamp: 20,
        decryptSettings: vi.fn(),
        assertCurrent: vi.fn(),
        applyProfile: vi.fn(),
        applySettings: vi.fn(),
        onUnsupportedSchema: vi.fn(),
        invalidateSettings: vi.fn(),
        log: vi.fn(),
        logError: vi.fn(),
        warn: vi.fn(),
        applyUpdate: vi.fn().mockImplementation(async (input) => {
            input.applyProfile(profile);
            input.applySettings({} as never, 7);
            return { schemaVersion: 2, settingsApplied: true };
        }),
        ...overrides,
    };
}

describe('handleUpdateAccountRealtime', () => {
    it('applies profile and settings while preserving the server settings log', async () => {
        const params = createParams();

        await handleUpdateAccountRealtime(params);

        expect(params.applySettings).toHaveBeenCalledWith(expect.anything(), 7);
        expect(params.log).toHaveBeenCalledWith(expect.stringContaining('Settings synced from server'));
        expect(params.invalidateSettings).not.toHaveBeenCalled();
    });

    it('keeps the profile update and invalidates settings when settings fail', async () => {
        const params = createParams({
            applyUpdate: vi.fn().mockImplementation(async (input) => {
                input.onSettingsError(new Error('decrypt failed'));
                return { settingsApplied: false };
            }),
        });

        await handleUpdateAccountRealtime(params);

        expect(params.invalidateSettings).toHaveBeenCalledOnce();
        expect(params.logError).toHaveBeenCalledWith('❌ Failed to process settings update:', expect.any(Error));
    });

    it('forwards unsupported schema warnings without blocking the update', async () => {
        const params = createParams({
            applyUpdate: vi.fn().mockImplementation(async (input) => {
                input.onUnsupportedSchema(99);
                return { schemaVersion: 99, settingsApplied: true };
            }),
        });

        await handleUpdateAccountRealtime(params);

        expect(params.warn).toHaveBeenCalledWith(expect.stringContaining('Received settings schema v99'));
    });
});
