import { describe, expect, it, vi } from 'vitest';
import {
    runPushTokenRegistrationApplication,
    type PushTokenRegistrationResult,
} from './pushTokenRegistrationApplication';

const grantedResult: PushTokenRegistrationResult = {
    registered: true,
    token: 'ExponentPushToken[abc]',
    permission: { status: 'granted', granted: true, canAskAgain: true },
};

describe('push token registration application', () => {
    it('runs inside the account request and logs a successful registration', async () => {
        const runRequest = vi.fn(async (operation: (signal: AbortSignal) => Promise<PushTokenRegistrationResult>) => (
            operation(new AbortController().signal)
        ));
        const syncPushToken = vi.fn(async () => grantedResult);
        const log = vi.fn();
        const warn = vi.fn();

        await runPushTokenRegistrationApplication({ runRequest, syncPushToken, log, warn });

        expect(runRequest).toHaveBeenCalledOnce();
        expect(syncPushToken).toHaveBeenCalledWith(expect.any(AbortSignal));
        expect(log).toHaveBeenCalledWith(expect.stringContaining('registered'));
        expect(warn).not.toHaveBeenCalled();
    });

    it('keeps permission failures as a warning and swallows request errors', async () => {
        const warn = vi.fn();
        const log = vi.fn();
        await runPushTokenRegistrationApplication({
            runRequest: async (operation) => operation(new AbortController().signal),
            syncPushToken: async () => ({
                ...grantedResult,
                registered: false,
                permission: { status: 'denied', granted: false, canAskAgain: false },
            }),
            log,
            warn,
        });
        expect(warn).toHaveBeenCalledWith('Failed to get push token for push notification!');

        await runPushTokenRegistrationApplication({
            runRequest: async () => { throw new Error('network'); },
            syncPushToken: vi.fn(),
            log,
            warn,
        });
        expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed to register push token'));
    });
});
