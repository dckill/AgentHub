import { describe, expect, it, vi } from 'vitest';
import {
    applyCodexForkedThread,
    applyCodexResumedThread,
    applyCodexStartedThread,
} from './codexThreadLifecycle';

describe('codexThreadLifecycle', () => {
    it('projects a newly started thread and clears its turn', () => {
        const state = { threadId: null as string | null, turnId: 'stale-turn' as string | null, defaults: null as unknown };
        const result = applyCodexStartedThread({
            result: { thread: { id: 'thread-1' }, model: 'gpt-5' },
            options: { model: 'gpt-5', cwd: '/tmp/project' },
            setThreadId: (value) => { state.threadId = value; },
            setTurnId: (value) => { state.turnId = value; },
            setDefaults: (value) => { state.defaults = value; },
        });

        expect(result).toEqual({ threadId: 'thread-1', model: 'gpt-5' });
        expect(state).toEqual({
            threadId: 'thread-1',
            turnId: null,
            defaults: { model: 'gpt-5', cwd: '/tmp/project' },
        });
    });

    it('merges resume overrides into existing defaults before projecting state', () => {
        const state = { threadId: null as string | null, turnId: 'stale-turn' as string | null, defaults: null as unknown };
        const setDefaults = vi.fn((value) => { state.defaults = value; });
        const result = applyCodexResumedThread({
            result: { thread: { id: 'thread-2' }, model: 'gpt-5-mini' },
            options: { model: 'gpt-5-mini' },
            existingDefaults: { cwd: '/tmp/project', model: 'gpt-5' },
            setThreadId: (value) => { state.threadId = value; },
            setTurnId: (value) => { state.turnId = value; },
            setDefaults,
        });

        expect(result).toEqual({ threadId: 'thread-2', model: 'gpt-5-mini' });
        expect(state.threadId).toBe('thread-2');
        expect(state.turnId).toBeNull();
        expect(setDefaults).toHaveBeenCalledWith({ cwd: '/tmp/project', model: 'gpt-5-mini' });
    });

    it('projects a forked thread while preserving the returned thread payload', () => {
        const state = { threadId: null as string | null, turnId: 'stale-turn' as string | null, defaults: null as unknown };
        const thread = { id: 'thread-forked', path: '/tmp/forked' };
        const result = applyCodexForkedThread({
            result: { thread, model: 'gpt-5' },
            options: { cwd: '/tmp/forked' },
            existingDefaults: { model: 'gpt-5-mini' },
            setThreadId: (value) => { state.threadId = value; },
            setTurnId: (value) => { state.turnId = value; },
            setDefaults: (value) => { state.defaults = value; },
        });

        expect(result).toEqual({ threadId: 'thread-forked', model: 'gpt-5', thread });
        expect(state).toEqual({
            threadId: 'thread-forked',
            turnId: null,
            defaults: { model: 'gpt-5-mini', cwd: '/tmp/forked' },
        });
    });
});
