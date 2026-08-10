import { beforeEach, describe, expect, it, vi } from 'vitest';

const tokenNew = vi.hoisted(() => vi.fn(async () => {
    const payload = Buffer.from(JSON.stringify({
        sub: 'user-1',
        jti: 'issued-token-id',
        exp: Math.floor(Date.now() / 1000) + 3600,
        keyVersion: 1,
    })).toString('base64url');
    return `header.${payload}.signature`;
}));
const tokenVerify = vi.hoisted(() => vi.fn(async () => ({
    user: 'user-1',
    uuid: 'token-id',
    extras: {
        keyVersion: 1,
    },
})));
const privacyKit = vi.hoisted(() => ({
    createPersistentTokenGenerator: vi.fn(async () => ({
        publicKey: new Uint8Array([1, 2, 3]),
        new: tokenNew,
    })),
    createPersistentTokenVerifier: vi.fn(async () => ({
        verify: tokenVerify,
    })),
}));
const db = vi.hoisted(() => ({
    authToken: {
        create: vi.fn(async ({ data }: any) => data),
        deleteMany: vi.fn(),
        delete: vi.fn(),
        findUnique: vi.fn<any>(async () => ({
            id: 'token-id', accountId: 'user-1', keyVersion: 1,
            expiresAt: new Date(Date.now() + 3600_000), revokedAt: null,
        })),
        updateMany: vi.fn(),
    },
}));

vi.mock('privacy-kit', () => privacyKit);
vi.mock('@/utils/log', () => ({ log: vi.fn() }));
vi.mock('@/storage/db', () => ({ db }));

describe('auth module identity', () => {
    beforeEach(() => {
        vi.resetModules();
        vi.clearAllMocks();
        process.env.AGENTHUB_MASTER_SECRET = 'test-secret';
        process.env.AGENTHUB_TOKEN_TTL_SECONDS = '3600';
    });

    it('initializes privacy-kit tokens with the AgentHub service name', async () => {
        const { auth } = await import('./auth');

        await auth.init();

        expect(privacyKit.createPersistentTokenGenerator).toHaveBeenCalledWith({
            service: 'agenthub',
            seed: 'test-secret',
        });
        expect(privacyKit.createPersistentTokenVerifier).toHaveBeenCalledWith({
            service: 'agenthub',
            publicKey: new Uint8Array([1, 2, 3]),
        });
    });

    it('issues an expiring versioned token backed by a persistent jti record', async () => {
        const { auth } = await import('./auth');
        await auth.init();

        await auth.createToken('user-1');

        expect(tokenNew).toHaveBeenCalledWith(expect.objectContaining({
            user: 'user-1',
            extras: expect.objectContaining({
                exp: expect.any(Number),
                keyVersion: 1,
            }),
        }));
        expect(db.authToken.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            accountId: 'user-1',
            id: 'issued-token-id',
            keyVersion: 1,
            expiresAt: expect.any(Date),
        }) });
    });

    it('rejects a cryptographically valid token after persistent revocation', async () => {
        db.authToken.findUnique.mockResolvedValueOnce({
            id: 'token-id', accountId: 'user-1', keyVersion: 1,
            expiresAt: new Date(Date.now() + 3600_000), revokedAt: new Date(),
        });
        const { auth } = await import('./auth');
        await auth.init();

        await expect(auth.verifyToken('signed-token')).resolves.toBeNull();
    });

    it('accepts privacy-kit verified user/uuid claims and returns extras', async () => {
        const { auth } = await import('./auth');
        await auth.init();

        await expect(auth.verifyToken('signed-token')).resolves.toEqual({
            userId: 'user-1',
            extras: { keyVersion: 1 },
        });
    });

    it('stops the expiry cleanup timer during shutdown', async () => {
        vi.useFakeTimers();
        try {
            const { auth } = await import('./auth');
            await auth.init();
            await auth.shutdown();

            vi.advanceTimersByTime(60 * 60 * 1000);
            expect(db.authToken.deleteMany).not.toHaveBeenCalled();
        } finally {
            vi.useRealTimers();
        }
    });
});
