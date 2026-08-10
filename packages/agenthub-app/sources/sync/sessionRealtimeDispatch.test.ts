import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdateContainer } from './apiTypes';
import {
    dispatchSessionRealtimeUpdate,
    type SessionRealtimeDispatchContext,
} from './sessionRealtimeDispatch';

const context = (): SessionRealtimeDispatchContext => ({
    getSession: vi.fn(),
    ensureSessionLoaded: vi.fn(),
    getSessionEncryption: vi.fn(),
    assertCurrent: vi.fn(),
    refreshMissingSession: vi.fn(),
    invalidateSessions: vi.fn(),
    applySession: vi.fn(),
    invalidateGitStatus: vi.fn(),
    refreshMessages: vi.fn(),
    deleteSession: vi.fn(),
    removeSessionEncryption: vi.fn(),
    removeProjectSession: vi.fn(),
    cleanupResources: vi.fn(),
    log: vi.fn(),
    logError: vi.fn(),
});

const envelope = (body: ApiUpdateContainer['body']): ApiUpdateContainer => ({
    id: 'update-1',
    seq: 7,
    createdAt: 100,
    body,
});

describe('session realtime dispatch', () => {
    it('routes new, update, and delete session envelopes with the current snapshot', async () => {
        const params = context();
        const newHandler = vi.fn(async () => undefined);
        const updateHandler = vi.fn(async () => undefined);
        const deleteHandler = vi.fn();

        await expect(dispatchSessionRealtimeUpdate(envelope({
            t: 'new-session',
            id: 'session-1',
            createdAt: 10,
            updatedAt: 20,
        }), { ...params, handleNewSession: newHandler })).resolves.toBe(true);
        expect(newHandler).toHaveBeenCalledWith(expect.objectContaining({
            ensureSessionLoaded: expect.any(Function),
        }));

        await expect(dispatchSessionRealtimeUpdate(envelope({
            t: 'update-session',
            id: 'session-1',
        }), { ...params, handleUpdateSession: updateHandler })).resolves.toBe(true);
        expect(updateHandler).toHaveBeenCalledWith(expect.objectContaining({
            session: undefined,
            seq: 7,
            createdAt: 100,
        }));

        await expect(dispatchSessionRealtimeUpdate(envelope({
            t: 'delete-session',
            sid: 'session-1',
        }), { ...params, handleDeleteSession: deleteHandler })).resolves.toBe(true);
        expect(deleteHandler).toHaveBeenCalledWith(expect.objectContaining({
            sessionId: 'session-1',
        }));
    });

    it('returns false without side effects for non-session updates', async () => {
        const params = context();

        await expect(dispatchSessionRealtimeUpdate(envelope({
            t: 'delete-machine',
            machineId: 'machine-1',
        }), params)).resolves.toBe(false);

        expect(params.applySession).not.toHaveBeenCalled();
        expect(params.deleteSession).not.toHaveBeenCalled();
    });
});
