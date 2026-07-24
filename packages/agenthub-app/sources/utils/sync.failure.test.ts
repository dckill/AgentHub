import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/utils/time', () => ({
    backoff: async <T>(callback: () => Promise<T>) => callback(),
}));

import { InvalidateSync, ValueSync } from './sync';

const timeout = (ms: number) => new Promise<{ status: 'timeout' }>((resolve) => {
    setTimeout(() => resolve({ status: 'timeout' }), ms);
});

describe('sync queue terminal failures', () => {
    beforeEach(() => vi.restoreAllMocks());

    it('rejects ValueSync waiters and accepts a later retry after a terminal failure', async () => {
        const command = vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(undefined);
        const sync = new ValueSync(command);

        const failed = sync.setValueAndAwait('first').then(
            () => ({ status: 'resolved' as const }),
            (error: Error) => ({ status: 'rejected' as const, message: error.message }),
        );
        await expect(Promise.race([failed, timeout(50)]))
            .resolves.toEqual({ status: 'rejected', message: 'offline' });
        await expect(sync.setValueAndAwait('second')).resolves.toBeUndefined();
        expect(command).toHaveBeenCalledTimes(2);
    });

    it('rejects InvalidateSync waiters and permits a later invalidation', async () => {
        const command = vi.fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValueOnce(undefined);
        const sync = new InvalidateSync(command);

        const failed = sync.invalidateAndAwait().then(
            () => ({ status: 'resolved' as const }),
            (error: Error) => ({ status: 'rejected' as const, message: error.message }),
        );
        await expect(Promise.race([failed, timeout(50)]))
            .resolves.toEqual({ status: 'rejected', message: 'offline' });
        await expect(sync.invalidateAndAwait()).resolves.toBeUndefined();
        expect(command).toHaveBeenCalledTimes(2);
    });
});
