import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db } = vi.hoisted(() => ({
    db: {
        session: {
            findMany: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

vi.mock('@/storage/db', () => ({ db }));

import { releaseDisconnectedDeviceControl } from './sessionControl';

describe('session control disconnect recovery', () => {
    beforeEach(() => vi.clearAllMocks());

    it('keeps ownership while another socket from the same device is connected', async () => {
        const io = { in: vi.fn(() => ({ fetchSockets: vi.fn(async () => [
            { id: 'socket-b', data: { clientType: 'user-scoped', deviceId: 'device-a' } },
        ]) })) };

        await expect(releaseDisconnectedDeviceControl({
            io: io as any,
            accountId: 'u1',
            deviceId: 'device-a',
            socketId: 'socket-a',
        })).resolves.toEqual([]);
        expect(db.session.findMany).not.toHaveBeenCalled();
    });

    it('releases all sessions owned by a disconnected device and returns fresh states', async () => {
        const io = { in: vi.fn(() => ({ fetchSockets: vi.fn(async () => []) })) };
        db.session.findMany
            .mockResolvedValueOnce([{ id: 's1' }, { id: 's2' }])
            .mockResolvedValueOnce([
                { id: 's1', activeDeviceId: null, activeDeviceAt: new Date(10) },
                { id: 's2', activeDeviceId: 'device-b', activeDeviceAt: new Date(11) },
            ]);
        db.session.updateMany.mockResolvedValue({ count: 1 });

        await expect(releaseDisconnectedDeviceControl({
            io: io as any,
            accountId: 'u1',
            deviceId: 'device-a',
            now: 10,
        })).resolves.toEqual([
            { sessionId: 's1', activeDeviceId: null, activeDeviceAt: 10 },
            { sessionId: 's2', activeDeviceId: 'device-b', activeDeviceAt: 11 },
        ]);
        expect(db.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { accountId: 'u1', activeDeviceId: 'device-a' },
        }));
    });
});
