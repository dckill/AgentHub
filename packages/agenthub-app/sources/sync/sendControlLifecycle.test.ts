import { describe, expect, it, vi } from 'vitest';
import { ensureSendControl } from './sendControlLifecycle';

type Control = { mode: 'unknown' | 'unclaimed' | 'controller' | 'observer' };

describe('ensureSendControl', () => {
    it('refreshes unknown state before claiming an unclaimed session', async () => {
        let current: Control = { mode: 'unknown' };
        const apply = vi.fn((next: Control) => {
            current = next;
        });
        const getRemoteState = vi.fn(async () => ({ mode: 'unclaimed' as const }));
        const claimRemote = vi.fn(async () => ({ mode: 'controller' as const }));

        const result = await ensureSendControl({
            initial: current,
            getCurrent: () => current,
            getRemoteState,
            claimRemote,
            apply,
        });

        expect(result).toEqual({ mode: 'controller' });
        expect(getRemoteState).toHaveBeenCalledOnce();
        expect(claimRemote).toHaveBeenCalledOnce();
        expect(apply).toHaveBeenCalledTimes(2);
    });

    it('does not perform network calls for an already owned or observer session', async () => {
        const getRemoteState = vi.fn();
        const claimRemote = vi.fn();
        const apply = vi.fn();

        await expect(ensureSendControl({
            initial: { mode: 'controller' },
            getCurrent: () => ({ mode: 'controller' }),
            getRemoteState,
            claimRemote,
            apply,
        })).resolves.toEqual({ mode: 'controller' });

        expect(getRemoteState).not.toHaveBeenCalled();
        expect(claimRemote).not.toHaveBeenCalled();
        expect(apply).not.toHaveBeenCalled();
    });

    it('propagates control failures so the caller can fail closed', async () => {
        const error = new Error('control unavailable');
        await expect(ensureSendControl({
            initial: { mode: 'unknown' },
            getCurrent: () => ({ mode: 'unknown' }),
            getRemoteState: async () => { throw error; },
            claimRemote: async () => ({ mode: 'controller' as const }),
            apply: vi.fn(),
        })).rejects.toBe(error);
    });

    it('does not apply a remote control result after the account becomes stale', async () => {
        let current: Control = { mode: 'unknown' };
        let currentGeneration = true;
        let resolveRemote!: (state: Control) => void;
        const getRemoteState = vi.fn(() => new Promise<Control>((resolve) => {
            resolveRemote = resolve;
        }));
        const apply = vi.fn((next: Control) => {
            current = next;
        });
        const pending = ensureSendControl({
            initial: current,
            getCurrent: () => current,
            getRemoteState,
            claimRemote: vi.fn(async () => ({ mode: 'controller' as const })),
            apply,
            isCurrent: () => currentGeneration,
        });

        currentGeneration = false;
        resolveRemote({ mode: 'unclaimed' });

        await expect(pending).resolves.toEqual({ mode: 'unknown' });
        expect(apply).not.toHaveBeenCalled();
    });
});
