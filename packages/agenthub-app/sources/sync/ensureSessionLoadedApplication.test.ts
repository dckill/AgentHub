import { describe, expect, it, vi } from 'vitest';
import { ensureSessionLoadedApplication } from './ensureSessionLoadedApplication';

describe('ensureSessionLoadedApplication', () => {
    it('returns the existing value without loading or applying it', async () => {
        const load = vi.fn();
        const apply = vi.fn();

        await expect(ensureSessionLoadedApplication({
            existing: { id: 'session-1' },
            load,
            apply,
        })).resolves.toEqual({ id: 'session-1' });

        expect(load).not.toHaveBeenCalled();
        expect(apply).not.toHaveBeenCalled();
    });

    it('returns null and does not apply when the remote session is missing', async () => {
        const apply = vi.fn();

        await expect(ensureSessionLoadedApplication({
            existing: undefined,
            load: async () => null,
            apply,
        })).resolves.toBeNull();

        expect(apply).not.toHaveBeenCalled();
    });

    it('applies a loaded session and returns the applied value', async () => {
        const apply = vi.fn(({ id }: { id: string }) => ({ id, applied: true }));

        await expect(ensureSessionLoadedApplication({
            existing: undefined,
            load: async () => ({ id: 'session-2' }),
            apply,
        })).resolves.toEqual({ id: 'session-2', applied: true });

        expect(apply).toHaveBeenCalledWith({ id: 'session-2' });
    });
});
