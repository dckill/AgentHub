import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, tx, create } = vi.hoisted(() => {
    const create = vi.fn(async () => ({ version: 0 }));
    const tx = {
        userKVStore: {
            findUnique: vi.fn(async () => null),
            count: vi.fn(async () => 10_000),
            create,
            update: vi.fn(),
        },
    };
    return {
        tx,
        create,
        db: { $transaction: vi.fn(async (callback: any) => callback(tx)) },
    };
});

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));

import { kvMutate } from './kvMutate';

describe('kvMutate account quota', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects a new key inside the transaction when the account quota is full', async () => {
        await expect(kvMutate({ uid: 'user-1' }, [{ key: 'new-key', value: 'dmFsdWU=', version: -1 }]))
            .rejects.toMatchObject({ name: 'AccountQuotaError', resource: 'kv', limit: 10_000 });
        expect(tx.userKVStore.count).toHaveBeenCalledWith({ where: { accountId: 'user-1' } });
        expect(create).not.toHaveBeenCalled();
    });
});
