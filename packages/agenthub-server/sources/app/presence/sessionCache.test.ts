import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, databaseUpdatesSkippedCounter, sessionCacheCounter } = vi.hoisted(() => ({
    db: {
        session: {
            findUnique: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        machine: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
    databaseUpdatesSkippedCounter: { inc: vi.fn() },
    sessionCacheCounter: { inc: vi.fn() },
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));
vi.mock('@/app/monitoring/metrics2', () => ({
    databaseUpdatesSkippedCounter,
    sessionCacheCounter,
}));

import { ActivityCache } from './sessionCache';

describe('ActivityCache', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('persists thinking when it changes before the activeAt update threshold', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });
        db.session.updateMany.mockResolvedValue({ count: 1 });

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(true);
        expect(cache.queueSessionUpdate('s1', 2000, true)).toBe(true);
        await cache.flushPendingUpdates();

        expect(db.session.updateMany).toHaveBeenCalledWith({
            where: { id: 's1', active: true },
            data: {
                lastActiveAt: new Date(2000),
                active: true,
                thinking: true,
                thinkingAt: new Date(2000),
            },
        });
        await cache.shutdown();
    });

    it('clears persisted thinking when the session reports idle', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: true,
            thinkingAt: new Date(1000),
        });
        db.session.updateMany.mockResolvedValue({ count: 1 });

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(true);
        expect(cache.queueSessionUpdate('s1', 2000, false)).toBe(true);
        await cache.flushPendingUpdates();

        expect(db.session.updateMany).toHaveBeenCalledWith({
            where: { id: 's1', active: true },
            data: {
                lastActiveAt: new Date(2000),
                active: true,
                thinking: false,
                thinkingAt: new Date(2000),
            },
        });
        await cache.shutdown();
    });

    it('invalidates a cached session after archive so queued heartbeats cannot reactivate it', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(true);
        expect(cache.queueSessionUpdate('s1', 40_000, false)).toBe(true);
        expect(cache.invalidateSession('s1', 'u1')).toBe(true);
        expect(cache.queueSessionUpdate('s1', 80_000, false)).toBe(false);
        await cache.flushPendingUpdates();

        expect(db.session.updateMany).not.toHaveBeenCalled();
        await cache.shutdown();
    });

    it('suppresses a heartbeat while an archived session write settles', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(true);
        cache.clearSessionUpdates('s1');

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(false);
        expect(cache.queueSessionUpdate('s1', 40_000, false)).toBe(false);
        await cache.flushPendingUpdates();

        expect(db.session.updateMany).not.toHaveBeenCalled();
        await cache.shutdown();
    });

    it('does not cache a validation result that finishes after archive starts', async () => {
        const cache = new ActivityCache({ autoStart: false });
        let resolveFindUnique!: (session: unknown) => void;
        db.session.findUnique.mockImplementation(() => new Promise(resolve => {
            resolveFindUnique = resolve;
        }));

        const validation = cache.isSessionValid('s1', 'u1');
        cache.clearSessionUpdates('s1');
        resolveFindUnique({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });

        await expect(validation).resolves.toBe(false);
        expect(cache.queueSessionUpdate('s1', 40_000, false)).toBe(false);
        await cache.shutdown();
    });

    it('resumes heartbeat validation when a stopped session is started again', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });

        cache.clearSessionUpdates('s1');
        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(false);
        cache.resumeSessionUpdates('s1');
        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(true);
        await cache.shutdown();
    });

    it('does not cache an inactive session after the archive invalidation', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: false,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(false);
        expect(cache.queueSessionUpdate('s1', 40_000, false)).toBe(false);
        await cache.shutdown();
    });

    it('does not reactivate a row archived between queue and heartbeat flush', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });
        db.session.updateMany.mockResolvedValue({ count: 0 });

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(true);
        expect(cache.queueSessionUpdate('s1', 40_000, false)).toBe(true);
        await cache.flushPendingUpdates();

        expect(db.session.updateMany).toHaveBeenCalledWith({
            where: { id: 's1', active: true },
            data: {
                lastActiveAt: new Date(40_000),
                active: true,
                thinking: false,
                thinkingAt: null,
            },
        });
        await cache.shutdown();
    });

    it('does not invalidate another account\'s session cache entry', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(true);
        expect(cache.invalidateSession('s1', 'u2')).toBe(false);
        expect(cache.queueSessionUpdate('s1', 40_000, false)).toBe(true);
        await cache.shutdown();
    });

    it('保留数据库失败的会话更新并允许下一轮重试', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.session.findUnique.mockResolvedValue({
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1000),
            thinking: false,
            thinkingAt: null,
        });
        db.session.updateMany
            .mockRejectedValueOnce(new Error('database unavailable'))
            .mockResolvedValueOnce({ count: 1 });

        await expect(cache.isSessionValid('s1', 'u1')).resolves.toBe(true);
        expect(cache.queueSessionUpdate('s1', 40_000, true)).toBe(true);

        await cache.flushPendingUpdates();
        await cache.flushPendingUpdates();

        expect(db.session.updateMany).toHaveBeenCalledTimes(2);
        expect(db.session.updateMany).toHaveBeenLastCalledWith({
            where: { id: 's1', active: true },
            data: {
                lastActiveAt: new Date(40_000),
                active: true,
                thinking: true,
                thinkingAt: new Date(40_000),
            },
        });
        await cache.shutdown();
    });

    it('保留数据库失败的机器更新并允许下一轮重试', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.machine.findUnique.mockResolvedValue({
            id: 'm1',
            accountId: 'u1',
            lastActiveAt: new Date(1000),
        });
        db.machine.update
            .mockRejectedValueOnce(new Error('database unavailable'))
            .mockResolvedValueOnce({});

        await expect(cache.isMachineValid('m1', 'u1')).resolves.toBe(true);
        expect(cache.queueMachineUpdate('m1', 40_000)).toBe(true);

        await cache.flushPendingUpdates();
        await cache.flushPendingUpdates();

        expect(db.machine.update).toHaveBeenCalledTimes(2);
        expect(db.machine.update).toHaveBeenLastCalledWith({
            where: { accountId_id: { accountId: 'u1', id: 'm1' } },
            data: { lastActiveAt: new Date(40_000) },
        });
        await cache.shutdown();
    });

    it('等待最终 flush 完成后才结束 shutdown', async () => {
        const cache = new ActivityCache({ autoStart: false });
        db.machine.findUnique.mockResolvedValue({
            id: 'm1',
            accountId: 'u1',
            lastActiveAt: new Date(1000),
        });
        let resolveUpdate: (() => void) | undefined;
        db.machine.update.mockImplementation(() => new Promise(resolve => {
            resolveUpdate = () => resolve({});
        }));

        await expect(cache.isMachineValid('m1', 'u1')).resolves.toBe(true);
        expect(cache.queueMachineUpdate('m1', 40_000)).toBe(true);

        const shutdown = cache.shutdown();
        expect(shutdown).toBeInstanceOf(Promise);
        expect(resolveUpdate).toBeDefined();
        resolveUpdate?.();
        await shutdown;
    });
});
