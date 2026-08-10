import { describe, expect, it, vi } from 'vitest';
import { handleCodexLifecycleNotification } from './codexLifecycleNotification';

describe('handleCodexLifecycleNotification', () => {
    it('records a started turn and marks the lifecycle notification handled', () => {
        const setTurnId = vi.fn();
        const markPendingTurnStarted = vi.fn();
        const emitRawTurnCompletion = vi.fn();

        expect(handleCodexLifecycleNotification({
            method: 'turn/started',
            params: { turn: { id: 'turn-1' } },
            setTurnId,
            markPendingTurnStarted,
            emitRawTurnCompletion,
            logLifecycle: vi.fn(),
            logMcp: vi.fn(),
            logUnhandled: vi.fn(),
        })).toBe(true);

        expect(setTurnId).toHaveBeenCalledWith('turn-1');
        expect(markPendingTurnStarted).toHaveBeenCalledWith('turn-1');
        expect(emitRawTurnCompletion).not.toHaveBeenCalled();
    });

    it('emits completion fallback and handles MCP startup notifications', () => {
        const emitRawTurnCompletion = vi.fn();
        const logMcp = vi.fn();
        const common = {
            setTurnId: vi.fn(),
            markPendingTurnStarted: vi.fn(),
            emitRawTurnCompletion,
            logLifecycle: vi.fn(),
            logMcp,
            logUnhandled: vi.fn(),
        };

        expect(handleCodexLifecycleNotification({
            ...common,
            method: 'turn/completed',
            params: { turn: { id: 'turn-1', status: 'completed', error: null } },
        })).toBe(true);
        expect(emitRawTurnCompletion).toHaveBeenCalledWith('turn-1', 'completed', undefined, 'turn/completed');

        expect(handleCodexLifecycleNotification({
            ...common,
            method: 'mcpServer/startupStatus/updated',
            params: { status: 'ready' },
        })).toBe(true);
        expect(logMcp).toHaveBeenCalledWith({ status: 'ready' });
    });

    it('logs and rejects unknown notification methods', () => {
        const logUnhandled = vi.fn();
        expect(handleCodexLifecycleNotification({
            method: 'unknown/method',
            params: {},
            setTurnId: vi.fn(),
            markPendingTurnStarted: vi.fn(),
            emitRawTurnCompletion: vi.fn(),
            logLifecycle: vi.fn(),
            logMcp: vi.fn(),
            logUnhandled,
        })).toBe(false);
        expect(logUnhandled).toHaveBeenCalledWith('unknown/method');
    });
});
