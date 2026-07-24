import { describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
    db: { account: { update: vi.fn(async () => ({ seq: 99 })) } },
}));

vi.mock('@/storage/db', () => ({ db }));

import { allocateUserSeq } from './seq';

describe('sequence allocation transaction boundary', () => {
    it('uses the supplied transaction client for user sequence allocation', async () => {
        const tx = { account: { update: vi.fn(async () => ({ seq: 7 })) } };

        await expect(allocateUserSeq('user-1', tx as any)).resolves.toBe(7);
        expect(tx.account.update).toHaveBeenCalledOnce();
        expect(db.account.update).not.toHaveBeenCalled();
    });
});
