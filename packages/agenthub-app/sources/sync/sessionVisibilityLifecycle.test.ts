import { describe, expect, it, vi } from 'vitest';
import { runSessionVisibility, retrySessionMessages } from './sessionVisibilityLifecycle';

describe('session visibility lifecycle', () => {
    it('clears message errors, refreshes messages and git status, and applies control state', async () => {
        const calls: string[] = [];
        const applyControl = vi.fn((value: unknown) => calls.push(`control:${String(value)}`));

        runSessionVisibility({
            sessionId: 'session-1',
            clearMessageError: (id) => calls.push(`clear:${id}`),
            invalidateMessages: (id) => calls.push(`messages:${id}`),
            invalidateGitStatus: (id) => calls.push(`git:${id}`),
            loadSessionControl: async () => 'claimed',
            applySessionControl: applyControl,
            isCurrent: () => true,
            warn: vi.fn(),
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(calls).toEqual(['clear:session-1', 'messages:session-1', 'git:session-1', 'control:claimed']);
    });

    it('keeps visibility refresh fail-soft when control loading fails', async () => {
        const warn = vi.fn();
        const error = new Error('offline');

        runSessionVisibility({
            sessionId: 'session-1',
            clearMessageError: vi.fn(),
            invalidateMessages: vi.fn(),
            invalidateGitStatus: vi.fn(),
            loadSessionControl: async () => { throw error; },
            applySessionControl: vi.fn(),
            isCurrent: () => true,
            warn,
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(warn).toHaveBeenCalledWith('Failed to load session control:', error);
    });

    it('does not apply control state after the account becomes stale', async () => {
        let resolveControl!: (value: string) => void;
        const loadSessionControl = new Promise<string>((resolve) => {
            resolveControl = resolve;
        });
        const applyControl = vi.fn();
        const isCurrent = vi.fn(() => false);

        runSessionVisibility({
            sessionId: 'session-1',
            clearMessageError: vi.fn(),
            invalidateMessages: vi.fn(),
            invalidateGitStatus: vi.fn(),
            loadSessionControl: () => loadSessionControl,
            applySessionControl: applyControl,
            isCurrent,
            warn: vi.fn(),
        });

        resolveControl('stale-claimed');
        await loadSessionControl;
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(isCurrent).toHaveBeenCalled();
        expect(applyControl).not.toHaveBeenCalled();
    });

    it('retries only the message sync and clears its previous error', () => {
        const clearMessageError = vi.fn();
        const invalidateMessages = vi.fn();

        retrySessionMessages({
            sessionId: 'session-1',
            clearMessageError,
            invalidateMessages,
        });

        expect(clearMessageError).toHaveBeenCalledWith('session-1');
        expect(invalidateMessages).toHaveBeenCalledWith('session-1');
    });
});
