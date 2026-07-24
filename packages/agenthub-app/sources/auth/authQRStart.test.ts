import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => vi.fn());
vi.mock('@/sync/publicHttpClient', () => ({ publicHttpClient: { request } }));
vi.mock('expo-crypto', () => ({ getRandomBytes: vi.fn(() => new Uint8Array(32)) }));
vi.mock('@/encryption/libsodium.lib', () => ({
    default: {
        ready: Promise.resolve(),
        crypto_box_seed_keypair: vi.fn(() => ({ publicKey: new Uint8Array(32), privateKey: new Uint8Array(32) })),
    },
}));

import { authQRStart, prepareAuthKeyPair, type QRAuthKeyPair } from './authQRStart';

describe('authQRStart polling proof', () => {
    beforeEach(() => request.mockReset().mockResolvedValue({ data: { state: 'requested' } }));

    it('sends a distinct 32-byte polling secret without placing it in the QR public key', async () => {
        const keypair: QRAuthKeyPair = {
            publicKey: new Uint8Array(32).fill(7),
            secretKey: new Uint8Array(32).fill(8),
            pollingSecret: new Uint8Array(32).fill(9),
        };

        await expect(authQRStart(keypair)).resolves.toBe(true);

        expect(request).toHaveBeenCalledWith('/v1/auth/account/request', expect.objectContaining({
            method: 'POST',
            body: {
                publicKey: Buffer.from(keypair.publicKey).toString('base64'),
                pollingSecret: Buffer.from(keypair.pollingSecret).toString('base64'),
            },
        }));
        expect(keypair.publicKey).not.toEqual(keypair.pollingSecret);
    });

    it('prepares libsodium before generating a QR keypair', async () => {
        await expect(prepareAuthKeyPair()).resolves.toEqual({
            publicKey: new Uint8Array(32),
            secretKey: new Uint8Array(32),
            pollingSecret: new Uint8Array(32),
        });
    });
});
