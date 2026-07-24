import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    let resolveReady!: () => void;
    const ready = new Promise<void>((resolve) => {
        resolveReady = resolve;
    });
    return {
        ready,
        resolveReady,
        authChallenge: vi.fn(() => ({
            challenge: new Uint8Array([1]),
            signature: new Uint8Array([2]),
            publicKey: new Uint8Array([3]),
        })),
        request: vi.fn().mockResolvedValue({ data: { token: 'token' } }),
    };
});

vi.mock('@/encryption/libsodium.lib', () => ({ default: { ready: mocks.ready } }));
vi.mock('./authChallenge', () => ({ authChallenge: mocks.authChallenge }));
vi.mock('@/sync/publicHttpClient', () => ({ publicHttpClient: { request: mocks.request } }));

import { authGetToken } from './authGetToken';

describe('authGetToken sodium readiness', () => {
    it('does not derive or submit the auth challenge before libsodium is ready', async () => {
        const pending = authGetToken(new Uint8Array(32));
        await Promise.resolve();

        expect(mocks.authChallenge).not.toHaveBeenCalled();
        expect(mocks.request).not.toHaveBeenCalled();

        mocks.resolveReady();
        await expect(pending).resolves.toBe('token');
        expect(mocks.authChallenge).toHaveBeenCalledOnce();
        expect(mocks.request).toHaveBeenCalledOnce();
    });
});
