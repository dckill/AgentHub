import { describe, expect, it, vi } from 'vitest';

const { inTx, tx } = vi.hoisted(() => {
    const tx = { marker: 'transaction-client' };
    return { tx, inTx: vi.fn(async (callback) => callback(tx)) };
});

vi.mock('@/storage/inTx', () => ({ inTx }));

describe('account quotas', () => {
    it('uses safe defaults and accepts bounded self-hosted overrides', async () => {
        const module = await import('./accountQuotas').catch(() => ({} as any));
        expect(module.readAccountQuotas).toBeTypeOf('function');

        expect(module.readAccountQuotas({})).toMatchObject({ sessions: 10_000, artifacts: 1_000, credentials: 100 });
        expect(module.readAccountQuotas({ AGENTHUB_QUOTA_SESSIONS: '25000' }).sessions).toBe(25_000);
        expect(module.readAccountQuotas({ AGENTHUB_QUOTA_SESSIONS: 'invalid' }).sessions).toBe(10_000);
        expect(module.readAccountQuotas({ AGENTHUB_QUOTA_SESSIONS: '0' }).sessions).toBe(10_000);
    });

    it('checks count and creates inside the same serializable transaction', async () => {
        const module = await import('./accountQuotas').catch(() => ({} as any));
        expect(module.createWithinAccountQuota).toBeTypeOf('function');
        const count = vi.fn(async () => 9);
        const create = vi.fn(async () => ({ id: 'created' }));

        await expect(module.createWithinAccountQuota({ resource: 'artifacts', limit: 10, count, create })).resolves.toEqual({ id: 'created' });
        expect(count).toHaveBeenCalledWith(tx);
        expect(create).toHaveBeenCalledWith(tx);
        expect(inTx).toHaveBeenCalledOnce();
    });

    it('rejects before create when the account is at quota', async () => {
        const module = await import('./accountQuotas').catch(() => ({} as any));
        expect(module.createWithinAccountQuota).toBeTypeOf('function');
        const create = vi.fn();

        await expect(module.createWithinAccountQuota({
            resource: 'sessions',
            limit: 2,
            count: async () => 2,
            create,
        })).rejects.toMatchObject({ name: 'AccountQuotaError', resource: 'sessions', limit: 2 });
        expect(create).not.toHaveBeenCalled();
    });
});
