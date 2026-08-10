import { describe, expect, it, vi } from 'vitest';
import { runActivityFlushLifecycle } from './activityFlushLifecycle';

describe('activity flush lifecycle', () => {
    it('binds the current sessions snapshot and projection callback', () => {
        const updates = new Map([['session-1', { timestamp: 10 } as never]]);
        const sessions = { 'session-1': { id: 'session-1' } } as never;
        const applySessions = vi.fn();
        const apply = vi.fn(() => 1);

        const result = runActivityFlushLifecycle({
            updates,
            getSessions: () => sessions,
            applySessions,
            apply,
        });

        expect(result).toBe(1);
        expect(apply).toHaveBeenCalledWith({
            updates,
            sessions,
            applySessions,
        });
    });

    it('uses the default activity flush application when no override is supplied', () => {
        const applySessions = vi.fn();
        const result = runActivityFlushLifecycle({
            updates: new Map(),
            getSessions: () => ({} as never),
            applySessions,
        });

        expect(result).toBe(0);
        expect(applySessions).not.toHaveBeenCalled();
    });
});
