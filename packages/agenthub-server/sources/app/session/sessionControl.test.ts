import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
    db: {
        session: {
            findFirst: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

vi.mock('@/storage/db', () => ({ db }));

import {
    canControlSession,
    claimSessionControl,
    getSessionControl,
    releaseSessionControl,
} from './sessionControl';

describe('session control persistence', () => {
    beforeEach(() => vi.clearAllMocks());

    it('claims an unowned session and treats a repeated claim by the same device as idempotent', async () => {
        db.session.findFirst
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: null, activeDeviceAt: null })
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: 'device-a', activeDeviceAt: new Date(1) });
        db.session.updateMany.mockResolvedValue({ count: 1 });

        const first = await claimSessionControl('u1', 's1', 'device-a', 1_700_000_000_000);
        const second = await claimSessionControl('u1', 's1', 'device-a', 1_700_000_000_100);

        expect(first.result).toBe('granted');
        expect(second.result).toBe('granted');
        expect(db.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ id: 's1', accountId: 'u1' }),
            data: expect.objectContaining({ activeDeviceId: 'device-a' }),
        }));
    });

    it('does not silently take over a session owned by another device', async () => {
        db.session.findFirst.mockResolvedValue({ id: 's1', activeDeviceId: 'device-b', activeDeviceAt: new Date(2) });

        const result = await claimSessionControl('u1', 's1', 'device-a', 1_700_000_000_000);

        expect(result).toMatchObject({ result: 'occupied', activeDeviceId: 'device-b' });
        expect(db.session.updateMany).not.toHaveBeenCalled();
    });

    it('reports occupied when a competing claim wins between read and conditional update', async () => {
        db.session.findFirst
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: null, activeDeviceAt: null })
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: 'device-b', activeDeviceAt: new Date(3) });
        db.session.updateMany.mockResolvedValue({ count: 0 });

        await expect(claimSessionControl('u1', 's1', 'device-a', 4)).resolves.toMatchObject({
            result: 'occupied',
            activeDeviceId: 'device-b',
        });
    });

    it('releases only when the caller owns the session and exposes read state', async () => {
        db.session.findFirst
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: 'device-b', activeDeviceAt: new Date(2) })
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: 'device-a', activeDeviceAt: new Date(3) })
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: null, activeDeviceAt: null });
        db.session.updateMany.mockResolvedValue({ count: 1 });

        await expect(releaseSessionControl('u1', 's1', 'device-a', 4)).resolves.toMatchObject({ result: 'occupied' });
        await expect(releaseSessionControl('u1', 's1', 'device-a', 4)).resolves.toMatchObject({ result: 'released' });
        await expect(getSessionControl('u1', 's1')).resolves.toMatchObject({ sessionId: 's1', activeDeviceId: null });
    });

    it('keeps old clients compatible when a session is unowned, but denies them once owned', async () => {
        db.session.findFirst
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: null, activeDeviceAt: null })
            .mockResolvedValueOnce({ id: 's1', activeDeviceId: 'device-a', activeDeviceAt: new Date(1) });

        await expect(canControlSession('u1', 's1', undefined)).resolves.toBe(true);
        await expect(canControlSession('u1', 's1', undefined)).resolves.toBe(false);
    });
});
