import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdateContainer } from './apiTypes';
import type { Profile } from './profile';
import {
    dispatchAccountRealtimeUpdate,
    type AccountRealtimeDispatchContext,
} from './accountRealtimeDispatch';

const profile: Profile = {
    id: 'account-1',
    timestamp: 10,
    firstName: '用户',
    lastName: null,
    avatar: null,
};

const context = (): AccountRealtimeDispatchContext => ({
    currentProfile: profile,
    decryptSettings: vi.fn(),
    assertCurrent: vi.fn(),
    applyProfile: vi.fn(),
    applySettings: vi.fn(),
    invalidateSettings: vi.fn(),
    log: vi.fn(),
    logError: vi.fn(),
    warn: vi.fn(),
});

const envelope = (body: ApiUpdateContainer['body']): ApiUpdateContainer => ({
    id: 'update-1',
    seq: 7,
    createdAt: 100,
    body,
});

describe('account realtime dispatch', () => {
    it('routes update-account with the envelope timestamp', async () => {
        const params = context();
        const handler = vi.fn(async () => ({ settingsApplied: true }));

        await expect(dispatchAccountRealtimeUpdate(envelope({
            t: 'update-account',
            id: 'account-1',
            firstName: '新名',
            settings: { value: 'encrypted', version: 7 },
        }), { ...params, handleUpdateAccount: handler })).resolves.toBe(true);

        expect(handler).toHaveBeenCalledWith(expect.objectContaining({
            currentProfile: profile,
            timestamp: 100,
            accountUpdate: expect.objectContaining({ id: 'account-1' }),
        }));
    });

    it('returns false without side effects for non-account updates', async () => {
        const params = context();

        await expect(dispatchAccountRealtimeUpdate(envelope({
            t: 'delete-session',
            sid: 'session-1',
        }), params)).resolves.toBe(false);

        expect(params.applyProfile).not.toHaveBeenCalled();
        expect(params.applySettings).not.toHaveBeenCalled();
    });
});
