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
        cache.shutdown();
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
        cache.shutdown();
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
        cache.shutdown();
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
        cache.shutdown();
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
        cache.shutdown();
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
        cache.shutdown();
    });
});
