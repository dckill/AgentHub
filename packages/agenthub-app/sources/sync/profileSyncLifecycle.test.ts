import { describe, expect, it, vi } from 'vitest';
import { runProfileSync, type ProfileSyncOptions } from './profileSyncLifecycle';

describe('profile sync lifecycle', () => {
    it('binds profile fetch and application to the account generation', async () => {
        const runRequest = vi.fn(async <T>(_generation: number, operation: (request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<T>) => operation({
            signal: new AbortController().signal,
            assertCurrent: vi.fn(),
        }));
        const applyProfile = vi.fn();

        await runProfileSync({
            generation: 6,
            credentials: { token: 'token' } as never,
            runRequest: runRequest as unknown as ProfileSyncOptions['runRequest'],
            fetchProfile: vi.fn(async (_credentials, _signal) => ({
                id: 'account-1',
                timestamp: 42,
                firstName: 'Ada',
                lastName: 'Lovelace',
                avatar: null,
            })),
            assertCurrent: vi.fn(),
            applyProfile,
        });

        expect(runRequest).toHaveBeenCalledWith(6, expect.any(Function));
        expect(applyProfile).toHaveBeenCalledWith(expect.objectContaining({ firstName: 'Ada' }));
    });

    it('does not apply a profile when the account request fails', async () => {
        const error = new Error('offline');
        const applyProfile = vi.fn();

        await expect(runProfileSync({
            generation: 7,
            credentials: { token: 'token' } as never,
            runRequest: async (_generation, _operation) => { throw error; },
            fetchProfile: vi.fn(),
            assertCurrent: vi.fn(),
            applyProfile,
        })).rejects.toBe(error);

        expect(applyProfile).not.toHaveBeenCalled();
    });
});
