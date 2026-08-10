import { describe, expect, it, vi } from 'vitest';

import { runMessageFetchLifecycle } from './messageFetchLifecycle';

type Request = { id: string };

describe('runMessageFetchLifecycle', () => {
    it('projects a current network failure and rethrows it', async () => {
        const applyLoadError = vi.fn();
        const error = new TypeError('offline');

        await expect(runMessageFetchLifecycle<Request>({
            runRequest: async (operation) => operation({ id: 'request-1' }),
            runInLock: async (operation) => operation(),
            runPage: async () => { throw error; },
            classifyError: () => 'network',
            isCurrent: () => true,
            applyLoadError,
        })).rejects.toBe(error);

        expect(applyLoadError).toHaveBeenCalledWith('network');
    });

    it('does not project AbortError or stale-account failures', async () => {
        const applyLoadError = vi.fn();
        const abortError = new DOMException('stale', 'AbortError');

        await expect(runMessageFetchLifecycle<Request>({
            runRequest: async (operation) => operation({ id: 'request-1' }),
            runInLock: async (operation) => operation(),
            runPage: async () => { throw abortError; },
            classifyError: () => null,
            isCurrent: () => true,
            applyLoadError,
        })).rejects.toBe(abortError);

        await expect(runMessageFetchLifecycle<Request>({
            runRequest: async (operation) => operation({ id: 'request-2' }),
            runInLock: async (operation) => operation(),
            runPage: async () => { throw new Error('stale network'); },
            classifyError: () => 'network',
            isCurrent: () => false,
            applyLoadError,
        })).rejects.toThrow('stale network');

        expect(applyLoadError).not.toHaveBeenCalled();
    });

    it('propagates request or lock setup failures through the same projection', async () => {
        const applyLoadError = vi.fn();

        await expect(runMessageFetchLifecycle<Request>({
            runRequest: async () => { throw new Error('request setup'); },
            runInLock: async (operation) => operation(),
            runPage: async () => {},
            classifyError: () => 'timeout',
            isCurrent: () => true,
            applyLoadError,
        })).rejects.toThrow('request setup');

        expect(applyLoadError).toHaveBeenCalledWith('timeout');
    });
});
