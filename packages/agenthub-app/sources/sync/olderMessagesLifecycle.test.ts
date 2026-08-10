import { describe, expect, it, vi } from 'vitest';

import { runOlderMessagesLifecycle } from './olderMessagesLifecycle';

describe('runOlderMessagesLifecycle', () => {
    it('clears failure state when the page handler fails after entering the lock', async () => {
        const onFailure = vi.fn();
        const onResetLoading = vi.fn();
        const runInLock = async (operation: () => Promise<number>) => operation();

        await expect(runOlderMessagesLifecycle({
            runRequest: async (operation) => operation({ signal: new AbortController().signal }),
            runInLock,
            runPage: async () => {
                throw new Error('page failed');
            },
            isCurrent: () => true,
            onFailure,
            onResetLoading,
        })).rejects.toThrow('page failed');

        expect(onFailure).toHaveBeenCalledTimes(1);
        expect(onResetLoading).toHaveBeenCalledTimes(1);
    });

    it('clears failure state when request setup fails before entering the lock', async () => {
        const onFailure = vi.fn();
        const onResetLoading = vi.fn();

        await expect(runOlderMessagesLifecycle({
            runRequest: async () => {
                throw new Error('request setup failed');
            },
            runInLock: async (operation) => operation(),
            runPage: async () => 1,
            isCurrent: () => true,
            onFailure,
            onResetLoading,
        })).rejects.toThrow('request setup failed');

        expect(onFailure).toHaveBeenCalledTimes(1);
        expect(onResetLoading).toHaveBeenCalledTimes(1);
    });

    it('returns the page result and does not invoke failure cleanup on success', async () => {
        const onFailure = vi.fn();
        const onResetLoading = vi.fn();

        await expect(runOlderMessagesLifecycle({
            runRequest: async (operation) => operation({ signal: new AbortController().signal }),
            runInLock: async (operation) => operation(),
            runPage: async () => 7,
            isCurrent: () => true,
            onFailure,
            onResetLoading,
        })).resolves.toBe(7);

        expect(onFailure).not.toHaveBeenCalled();
        expect(onResetLoading).not.toHaveBeenCalled();
    });
});
