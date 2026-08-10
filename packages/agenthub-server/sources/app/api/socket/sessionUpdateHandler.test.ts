import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, activityCache, canControlSession } = vi.hoisted(() => ({
    db: { session: { findUnique: vi.fn(), update: vi.fn() } },
    activityCache: { invalidateSession: vi.fn(), clearSessionUpdates: vi.fn(), isSessionValid: vi.fn(), queueSessionUpdate: vi.fn() },
    canControlSession: vi.fn(),
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/app/presence/sessionCache', () => ({ activityCache }));
vi.mock('@/app/session/sessionControl', () => ({ canControlSession }));
vi.mock('@/app/monitoring/metrics2', () => ({
    getMetricsLabelsFromSocket: vi.fn(() => ({})),
    sessionAliveEventsCounter: { inc: vi.fn() },
    websocketEventsCounter: { inc: vi.fn() },
}));
vi.mock('@/app/events/eventRouter', () => ({
    buildNewMessageUpdate: vi.fn(),
    buildSessionActivityEphemeral: vi.fn(() => ({ type: 'session-activity' })),
    buildUpdateSessionUpdate: vi.fn(),
    eventRouter: { emitEphemeral: vi.fn(), emitUpdate: vi.fn() },
}));
vi.mock('@/app/session/messageAppend', () => ({ appendEncryptedSessionMessages: vi.fn() }));
vi.mock('@/storage/seq', () => ({ allocateUserSeq: vi.fn(async () => 1) }));
vi.mock('@/utils/lock', () => ({ AsyncLock: class { async inLock(fn: () => Promise<void>) { await fn(); } } }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));
vi.mock('@/utils/randomKeyNaked', () => ({ randomKeyNaked: vi.fn(() => 'update-id') }));

import { sessionUpdateHandler } from './sessionUpdateHandler';

describe('sessionUpdateHandler archive lifecycle', () => {
    beforeEach(() => vi.clearAllMocks());

    it('invalidates the activity cache after session-end deactivates the row', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { id: 'socket-1', on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };
        db.session.findUnique.mockResolvedValue({ id: 's1', accountId: 'u1' });
        db.session.update.mockResolvedValue({});
        const callback = vi.fn();
        const now = Date.now();

        sessionUpdateHandler('u1', socket as any, { connectionType: 'user-scoped' } as any);
        await handlers['session-end']({ sid: 's1', time: now }, callback);

        expect(db.session.update).toHaveBeenCalledWith({
            where: { id: 's1' },
            data: { lastActiveAt: new Date(now), active: false, thinking: false, thinkingAt: new Date(now) },
        });
        expect(activityCache.clearSessionUpdates).toHaveBeenCalledWith('s1');
        expect(callback).toHaveBeenCalledWith({ result: 'success' });
    });

    it('callbacks an error when update-metadata targets a missing session', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { id: 'socket-1', on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };
        db.session.findUnique.mockResolvedValueOnce(null);
        const callback = vi.fn();

        sessionUpdateHandler('u1', socket as any, { connectionType: 'machine-scoped' } as any);
        await handlers['update-metadata']({ sid: 'missing', metadata: 'encrypted', expectedVersion: 0 }, callback);

        expect(callback).toHaveBeenCalledWith({ result: 'error' });
    });

    it('does not let an observer device write session-alive state', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { id: 'socket-observer', on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };
        canControlSession.mockResolvedValue(false);
        activityCache.isSessionValid.mockResolvedValue(true);

        sessionUpdateHandler('u1', socket as any, {
            connectionType: 'user-scoped',
            deviceId: 'observer-device',
        } as any);
        await handlers['session-alive']({ sid: 's1', time: Date.now(), thinking: true });

        expect(canControlSession).toHaveBeenCalledWith('u1', 's1', 'observer-device');
        expect(activityCache.isSessionValid).not.toHaveBeenCalled();
        expect(activityCache.queueSessionUpdate).not.toHaveBeenCalled();
    });

    it('ignores malformed session-alive thinking values', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { id: 'socket-controller', on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };
        canControlSession.mockResolvedValue(true);
        activityCache.isSessionValid.mockResolvedValue(true);

        sessionUpdateHandler('u1', socket as any, {
            connectionType: 'user-scoped',
            deviceId: 'controller-device',
        } as any);
        await handlers['session-alive']({ sid: 's1', time: Date.now(), thinking: 'false' });

        expect(activityCache.queueSessionUpdate).not.toHaveBeenCalled();
    });

    it('records valid app-state changes only for user-scoped sockets', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { id: 'socket-controller', data: {}, on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };

        sessionUpdateHandler('u1', socket as any, { connectionType: 'user-scoped' } as any);
        await handlers['app-state']({ state: 'background' });
        expect(socket.data).toMatchObject({ appState: 'background' });

        await handlers['app-state']({ state: 'invalid' });
        expect(socket.data).toMatchObject({ appState: 'background' });
    });

    it('does not let machine-scoped sockets publish UI app-state', async () => {
        const handlers: Record<string, Function> = {};
        const socket = { id: 'socket-machine', data: {}, on: vi.fn((event: string, handler: Function) => { handlers[event] = handler; }) };

        sessionUpdateHandler('u1', socket as any, { connectionType: 'machine-scoped' } as any);
        await handlers['app-state']({ state: 'active' });
        expect(socket.data).toEqual({});
    });
});
