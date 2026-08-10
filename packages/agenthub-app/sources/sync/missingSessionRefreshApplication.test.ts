import { describe, expect, it, vi } from 'vitest';
import { scheduleMissingSessionRefresh } from './missingSessionRefreshApplication';

describe('missing session refresh application', () => {
    it('deduplicates an in-flight refresh and releases its key after completion', async () => {
        const active = new Set<string>();
        let resolveRefresh!: () => void;
        const refresh = vi.fn(() => new Promise<void>((resolve) => { resolveRefresh = resolve; }));

        scheduleMissingSessionRefresh({
            key: 'generation-1\u0000session-1',
            isInFlight: (key) => active.has(key),
            markInFlight: (key) => active.add(key),
            clearInFlight: (key) => active.delete(key),
            refresh,
            isCurrent: () => true,
            onCurrentError: vi.fn(),
        });
        scheduleMissingSessionRefresh({
            key: 'generation-1\u0000session-1',
            isInFlight: (key) => active.has(key),
            markInFlight: (key) => active.add(key),
            clearInFlight: (key) => active.delete(key),
            refresh,
            isCurrent: () => true,
            onCurrentError: vi.fn(),
        });
        expect(refresh).toHaveBeenCalledOnce();

        resolveRefresh();
        await vi.waitFor(() => expect(active).toEqual(new Set()));
    });

    it('reports only current-account failures and always clears the in-flight key', async () => {
        const onCurrentError = vi.fn();
        const clearInFlight = vi.fn();
        scheduleMissingSessionRefresh({
            key: 'key',
            isInFlight: () => false,
            markInFlight: vi.fn(),
            clearInFlight,
            refresh: async () => { throw new Error('network'); },
            isCurrent: () => true,
            onCurrentError,
        });
        await vi.waitFor(() => expect(onCurrentError).toHaveBeenCalledWith(expect.any(Error)));
        expect(clearInFlight).toHaveBeenCalledWith('key');

        const staleError = vi.fn();
        scheduleMissingSessionRefresh({
            key: 'stale',
            isInFlight: () => false,
            markInFlight: vi.fn(),
            clearInFlight: vi.fn(),
            refresh: async () => { throw new Error('stale'); },
            isCurrent: () => false,
            onCurrentError: staleError,
        });
        await vi.waitFor(() => expect(staleError).not.toHaveBeenCalled());
    });
});
