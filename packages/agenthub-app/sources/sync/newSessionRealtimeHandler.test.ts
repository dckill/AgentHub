import { describe, expect, it, vi } from 'vitest';

import { handleNewSessionRealtimeUpdate } from './newSessionRealtimeHandler';

describe('new-session realtime handler', () => {
    it('waits for the authoritative session load on success', async () => {
        const ensureSessionLoaded = vi.fn().mockResolvedValue({ id: 'session-1' });
        const onError = vi.fn();

        await expect(handleNewSessionRealtimeUpdate({
            ensureSessionLoaded,
            assertCurrent: vi.fn(),
            onError,
        })).resolves.toBeUndefined();

        expect(ensureSessionLoaded).toHaveBeenCalledTimes(1);
        expect(onError).not.toHaveBeenCalled();
    });

    it('asserts the account generation before invalidating after a load failure', async () => {
        const error = new Error('temporary failure');
        const assertCurrent = vi.fn();
        const onError = vi.fn();

        await handleNewSessionRealtimeUpdate({
            ensureSessionLoaded: vi.fn().mockRejectedValue(error),
            assertCurrent,
            onError,
        });

        expect(assertCurrent).toHaveBeenCalledTimes(1);
        expect(onError).toHaveBeenCalledWith(error);
    });

    it('does not invalidate a newer account when the old load rejects', async () => {
        const staleError = new Error('stale account');
        const onError = vi.fn();

        await expect(handleNewSessionRealtimeUpdate({
            ensureSessionLoaded: vi.fn().mockRejectedValue(new Error('load failed')),
            assertCurrent: () => { throw staleError; },
            onError,
        })).rejects.toBe(staleError);

        expect(onError).not.toHaveBeenCalled();
    });
});
