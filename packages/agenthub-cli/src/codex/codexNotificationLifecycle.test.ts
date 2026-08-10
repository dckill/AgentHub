import { describe, expect, it, vi } from 'vitest';
import { handleCodexNotificationLifecycle, type CodexNotificationLifecycleParams } from './codexNotificationLifecycle';

function createContext(overrides: Partial<CodexNotificationLifecycleParams> = {}) {
    let protocol: CodexNotificationLifecycleParams['getProtocol'] extends () => infer P ? P : never = 'unknown';
    const context: CodexNotificationLifecycleParams = {
        method: 'thread/started',
        params: {},
        getProtocol: () => protocol,
        setProtocol: (next) => { protocol = next; },
        getTurnId: () => null,
        setTurnId: vi.fn(),
        hasPendingTurn: () => false,
        markPendingTurnStarted: vi.fn(),
        emitRawTurnCompletion: vi.fn(),
        rememberCompletedTurnId: vi.fn(),
        tryResolvePendingTurn: vi.fn(),
        rawFileChangesByItemId: new Map(),
        emit: vi.fn(),
        logLifecycle: vi.fn(),
        logMcp: vi.fn(),
        logUnhandled: vi.fn(),
        logRaw: vi.fn(),
        ...overrides,
    };
    return { context, getProtocol: () => protocol };
}

describe('codex notification lifecycle wiring', () => {
    it('preserves legacy precedence and marks the protocol only after legacy handles it', () => {
        const { context, getProtocol } = createContext({
            method: 'codex/event',
            params: { msg: { type: 'task_started', turn_id: 'turn-1' } },
        });
        const result = handleCodexNotificationLifecycle(context);

        expect(result).toBe('legacy');
        expect(getProtocol()).toBe('legacy');
        expect(context.emit).toHaveBeenCalledWith({ type: 'task_started', turn_id: 'turn-1' });
        expect(context.logRaw).not.toHaveBeenCalled();
    });

    it('routes raw notifications before lifecycle fallback and forwards the method to logging', () => {
        const { context, getProtocol } = createContext({
            method: 'turn/started',
            params: { turnId: 'turn-1' },
        });
        const result = handleCodexNotificationLifecycle(context);

        expect(result).toBe('raw');
        expect(getProtocol()).toBe('raw');
        expect(context.logRaw).toHaveBeenCalledWith('turn/started');
        expect(context.setTurnId).toHaveBeenCalledWith('turn-1');
    });

    it('uses lifecycle fallback when neither compatibility protocol handles the message', () => {
        const { context } = createContext({
            method: 'thread/started',
            params: {},
        });
        const result = handleCodexNotificationLifecycle(context);

        expect(result).toBe('lifecycle');
        expect(context.logLifecycle).toHaveBeenCalledWith('thread/started');
    });
});
