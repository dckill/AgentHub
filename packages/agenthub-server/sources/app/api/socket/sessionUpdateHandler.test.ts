import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, activityCache } = vi.hoisted(() => ({
    db: { session: { findUnique: vi.fn(), update: vi.fn() } },
    activityCache: { invalidateSession: vi.fn() },
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/app/presence/sessionCache', () => ({ activityCache }));
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
        expect(activityCache.invalidateSession).toHaveBeenCalledWith('s1', 'u1');
        expect(callback).toHaveBeenCalledWith({ result: 'success' });
    });
});
