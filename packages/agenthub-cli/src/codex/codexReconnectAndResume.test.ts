import { describe, expect, it, vi } from 'vitest';
import { reconnectAndResumeCodexThread } from './codexReconnectAndResume';

describe('reconnectAndResumeCodexThread', () => {
    it('reconnects without resuming when no thread is active', async () => {
        const calls: string[] = [];

        await expect(reconnectAndResumeCodexThread({
            threadId: null,
            clearRecoveredTurns: () => calls.push('clear-recovered'),
            disconnect: async (preserve) => { calls.push(`disconnect:${preserve}`); },
            connect: async () => { calls.push('connect'); },
            resume: vi.fn(),
            reconcile: vi.fn(),
            clearThreadState: vi.fn(),
            onResumeFailure: vi.fn(),
        })).resolves.toBe(false);

        expect(calls).toEqual(['clear-recovered', 'disconnect:false', 'connect']);
    });

    it('resumes and reconciles the existing thread after reconnecting', async () => {
        const resume = vi.fn(async () => undefined);
        const reconcile = vi.fn(async () => undefined);

        await expect(reconnectAndResumeCodexThread({
            threadId: 'thread-1',
            clearRecoveredTurns: vi.fn(),
            disconnect: vi.fn(async () => undefined),
            connect: vi.fn(async () => undefined),
            resume,
            reconcile,
            clearThreadState: vi.fn(),
            onResumeFailure: vi.fn(),
        })).resolves.toBe(true);

        expect(resume).toHaveBeenCalledWith('thread-1');
        expect(reconcile).toHaveBeenCalledWith('thread-1');
    });

    it('clears thread state and reports a resume failure', async () => {
        const error = new Error('resume failed');
        const clearThreadState = vi.fn();
        const onResumeFailure = vi.fn();

        await expect(reconnectAndResumeCodexThread({
            threadId: 'thread-1',
            clearRecoveredTurns: vi.fn(),
            disconnect: vi.fn(async () => undefined),
            connect: vi.fn(async () => undefined),
            resume: vi.fn(async () => { throw error; }),
            reconcile: vi.fn(),
            clearThreadState,
            onResumeFailure,
        })).resolves.toBe(false);

        expect(onResumeFailure).toHaveBeenCalledWith(error);
        expect(clearThreadState).toHaveBeenCalledOnce();
    });
});
