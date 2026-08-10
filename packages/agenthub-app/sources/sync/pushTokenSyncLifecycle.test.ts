import { describe, expect, it, vi } from 'vitest';
import { runPushTokenSync, type PushTokenSyncOptions } from './pushTokenSyncLifecycle';

const registered = {
    registered: true,
    token: 'ExponentPushToken[test]',
    permission: { status: 'granted', granted: true },
};

describe('push token sync lifecycle', () => {
    it('binds token registration to the account generation and request signal', async () => {
        const runRequest = vi.fn(async <T>(_generation: number, operation: (request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<T>) => operation({
            signal: new AbortController().signal,
            assertCurrent: vi.fn(),
        }));
        const syncPushToken = vi.fn(async () => registered);

        await runPushTokenSync({
            generation: 3,
            credentials: { token: 'token' } as never,
            runRequest: runRequest as unknown as PushTokenSyncOptions['runRequest'],
            syncPushToken,
            log: vi.fn(),
            warn: vi.fn(),
        });

        expect(runRequest).toHaveBeenCalledWith(3, expect.any(Function));
        expect(syncPushToken).toHaveBeenCalledWith(expect.objectContaining({ token: 'token' }), expect.any(AbortSignal));
    });

    it('keeps provider failures fail-soft and logs the failure', async () => {
        const log = vi.fn();
        await expect(runPushTokenSync({
            generation: 4,
            credentials: { token: 'token' } as never,
            runRequest: async (_generation, operation) => operation({ signal: new AbortController().signal, assertCurrent: vi.fn() }),
            syncPushToken: async () => { throw new Error('permission denied'); },
            log,
            warn: vi.fn(),
        })).resolves.toBeUndefined();

        expect(log).toHaveBeenCalledWith(expect.stringContaining('Failed to register push token'));
    });
});
