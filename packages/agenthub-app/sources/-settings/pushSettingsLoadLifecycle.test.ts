import { describe, expect, it, vi } from 'vitest';
import type { PushToken } from '@/sync/apiPush';
import { runPushSettingsLoad } from './pushSettingsLoadLifecycle';

function deferred<T>() {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return { promise, resolve };
}

describe('push settings load lifecycle', () => {
    it('does not project an old account response after the account becomes stale', async () => {
        const tokens = deferred<PushToken[]>();
        let current = true;
        const apply = vi.fn();
        const setLoading = vi.fn();

        const loading = runPushSettingsLoad({
            fetchTokens: () => tokens.promise,
            getPermission: async () => ({ status: 'granted', granted: true, canAskAgain: true }),
            getCurrentToken: async () => 'token-old',
            isCurrent: () => current,
            apply,
            setLoading,
        });

        current = false;
        tokens.resolve([{ id: 'old', token: 'old-account-token', createdAt: 1, updatedAt: 1 }]);
        await loading;

        expect(apply).not.toHaveBeenCalled();
        expect(setLoading).toHaveBeenCalledWith(true);
        expect(setLoading).not.toHaveBeenCalledWith(false);
    });

    it('applies current-account values and clears loading after a successful load', async () => {
        const apply = vi.fn();
        const setLoading = vi.fn();

        await runPushSettingsLoad({
            fetchTokens: async () => [{ id: 'current', token: 'token-current', createdAt: 2, updatedAt: 2 }],
            getPermission: async () => ({ status: 'granted', granted: true, canAskAgain: true }),
            getCurrentToken: async () => 'token-current',
            isCurrent: () => true,
            apply,
            setLoading,
        });

        expect(apply).toHaveBeenCalledWith({
            tokens: [{ id: 'current', token: 'token-current', createdAt: 2, updatedAt: 2 }],
            permission: { status: 'granted', granted: true, canAskAgain: true },
            currentToken: 'token-current',
        });
        expect(setLoading).toHaveBeenNthCalledWith(1, true);
        expect(setLoading).toHaveBeenLastCalledWith(false);
    });
});
