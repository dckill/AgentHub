import { describe, expect, it, vi } from 'vitest';
import { prepareSendMessage } from './sendMessagePreparation';

type Control = { mode: 'unknown' | 'unclaimed' | 'controller' | 'observer' };

describe('prepareSendMessage', () => {
    it('claims unknown control before returning the ready session context', async () => {
        const initial: Control = { mode: 'unknown' };
        const claimed: Control = { mode: 'controller' };
        const encryption = { id: 'session-key' };
        const session = { id: 'session-1' };
        const ensureControl = vi.fn(async () => claimed);

        await expect(prepareSendMessage({
            initialControl: initial,
            ensureControl,
            getEncryption: () => encryption,
            getSession: () => session,
            initialFailureCount: 2,
        })).resolves.toEqual({
            kind: 'ready',
            control: claimed,
            encryption,
            session,
        });
        expect(ensureControl).toHaveBeenCalledWith(initial);
    });

    it('returns a control-denied result without touching encryption or session state', async () => {
        const getEncryption = vi.fn(() => ({ id: 'unused' }));
        const getSession = vi.fn(() => ({ id: 'unused' }));

        await expect(prepareSendMessage({
            initialControl: { mode: 'observer' },
            ensureControl: vi.fn(),
            getEncryption,
            getSession,
            initialFailureCount: 0,
        })).resolves.toEqual({ kind: 'control-denied' });
        expect(getEncryption).not.toHaveBeenCalled();
        expect(getSession).not.toHaveBeenCalled();
    });

    it('reports control acquisition failures before returning control denied', async () => {
        const error = new Error('control unavailable');
        const onControlError = vi.fn();

        await expect(prepareSendMessage({
            initialControl: { mode: 'unknown' },
            ensureControl: vi.fn(async () => { throw error; }),
            getEncryption: () => ({ id: 'unused' }),
            getSession: () => ({ id: 'unused' }),
            initialFailureCount: 0,
            onControlError,
        })).resolves.toEqual({ kind: 'control-denied' });
        expect(onControlError).toHaveBeenCalledWith(error);
    });

    it('preserves the existing failure count when encryption or session data is missing', async () => {
        await expect(prepareSendMessage({
            initialControl: { mode: 'controller' },
            ensureControl: vi.fn(),
            getEncryption: () => null,
            getSession: () => ({ id: 'unused' }),
            initialFailureCount: 3,
        })).resolves.toEqual({ kind: 'missing-encryption', failedAttachments: 3 });

        await expect(prepareSendMessage({
            initialControl: { mode: 'controller' },
            ensureControl: vi.fn(),
            getEncryption: () => ({ id: 'key' }),
            getSession: () => undefined,
            initialFailureCount: 1,
        })).resolves.toEqual({ kind: 'missing-session', failedAttachments: 1 });
    });

    it('fails closed when the account becomes stale after control preparation', async () => {
        let currentGeneration = true;
        const getEncryption = vi.fn(() => ({ id: 'unused' }));
        const getSession = vi.fn(() => ({ id: 'unused' }));

        await expect(prepareSendMessage({
            initialControl: { mode: 'unknown' },
            ensureControl: vi.fn(async (): Promise<Control> => {
                currentGeneration = false;
                return { mode: 'controller' as const };
            }),
            getEncryption,
            getSession,
            initialFailureCount: 0,
            isCurrent: () => currentGeneration,
        })).resolves.toEqual({ kind: 'control-denied' });
        expect(getEncryption).not.toHaveBeenCalled();
        expect(getSession).not.toHaveBeenCalled();
    });
});
