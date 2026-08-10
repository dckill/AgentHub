import { describe, expect, it, vi } from 'vitest';
import { handleDeleteSessionRealtime } from './deleteSessionRealtimeHandler';

describe('handleDeleteSessionRealtime', () => {
    it('delegates all cleanup actions and logs completion', () => {
        const applyDelete = vi.fn();
        const log = vi.fn();

        handleDeleteSessionRealtime({
            sessionId: 'session-1',
            deleteSession: vi.fn(),
            removeSessionEncryption: vi.fn(),
            removeProjectSession: vi.fn(),
            cleanupResources: vi.fn(),
            log,
            applyDelete,
        });

        expect(applyDelete).toHaveBeenCalledOnce();
        expect(applyDelete).toHaveBeenCalledWith('session-1', expect.objectContaining({
            deleteSession: expect.any(Function),
            removeSessionEncryption: expect.any(Function),
            removeProjectSession: expect.any(Function),
            cleanupResources: expect.any(Function),
        }));
        expect(log).toHaveBeenCalledWith('🗑️ Session session-1 deleted from local storage');
    });

    it('passes cleanup callbacks to the deletion application', () => {
        const actions = {
            deleteSession: vi.fn(),
            removeSessionEncryption: vi.fn(),
            removeProjectSession: vi.fn(),
            cleanupResources: vi.fn(),
        };
        const applyDelete = vi.fn();

        handleDeleteSessionRealtime({
            sessionId: 'session-2',
            ...actions,
            log: vi.fn(),
            applyDelete,
        });

        expect(applyDelete).toHaveBeenCalledWith('session-2', actions);
    });

    it('uses the real deletion application by default', () => {
        const actions = {
            deleteSession: vi.fn(),
            removeSessionEncryption: vi.fn(),
            removeProjectSession: vi.fn(),
            cleanupResources: vi.fn(),
        };

        handleDeleteSessionRealtime({
            sessionId: 'session-3',
            ...actions,
            log: vi.fn(),
        });

        expect(actions.deleteSession).toHaveBeenCalledWith('session-3');
        expect(actions.removeSessionEncryption).toHaveBeenCalledWith('session-3');
        expect(actions.removeProjectSession).toHaveBeenCalledWith('session-3');
        expect(actions.cleanupResources).toHaveBeenCalledWith('session-3');
    });
});
