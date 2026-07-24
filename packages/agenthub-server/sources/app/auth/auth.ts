import * as privacyKit from "privacy-kit";
import { db } from "@/storage/db";
import { log } from "@/utils/log";
import { readVersionedSecrets } from "@/config/versionedSecrets";

const DEFAULT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const CLEANUP_INTERVAL = 60 * 60 * 1000;

interface TokenPayload {
    user?: string;
    sub?: string;
    jti?: string;
    uuid?: string;
    exp?: number;
    keyVersion?: number;
    extras?: Record<string, unknown>;
}

interface AuthTokens {
    activeVersion: number;
    generator: Awaited<ReturnType<typeof privacyKit.createPersistentTokenGenerator>>;
    verifiers: Map<number, Awaited<ReturnType<typeof privacyKit.createPersistentTokenVerifier>>>;
}

function positiveInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function decodeGeneratedTokenPayload(token: string): { jti: string; exp: number; keyVersion: number } {
    const encodedPayload = token.split('.')[1];
    if (!encodedPayload) throw new Error('Generated token is missing a payload');

    let payload: unknown;
    try {
        payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
        throw new Error('Generated token payload is not valid JSON');
    }

    if (!payload || typeof payload !== 'object') throw new Error('Generated token payload is not an object');
    const candidate = payload as Partial<TokenPayload>;
    if (typeof candidate.jti !== 'string' || typeof candidate.exp !== 'number' || typeof candidate.keyVersion !== 'number') {
        throw new Error('Generated token payload is missing persistent claims');
    }
    return { jti: candidate.jti, exp: candidate.exp, keyVersion: candidate.keyVersion };
}

class AuthModule {
    private tokens: AuthTokens | null = null;
    private cleanupTimer: ReturnType<typeof setInterval> | null = null;

    async init(): Promise<void> {
        if (this.tokens) return;

        log({ module: 'auth' }, 'Initializing auth module...');
        const { activeVersion, keys } = readVersionedSecrets({
            keysEnv: 'AGENTHUB_TOKEN_KEYS',
            activeVersionEnv: 'AGENTHUB_TOKEN_KEY_VERSION',
            fallbackSecret: process.env.NODE_ENV === 'production' ? undefined : process.env.AGENTHUB_MASTER_SECRET,
        });
        const verifiers = new Map<number, Awaited<ReturnType<typeof privacyKit.createPersistentTokenVerifier>>>();
        let activeGenerator: Awaited<ReturnType<typeof privacyKit.createPersistentTokenGenerator>> | null = null;

        for (const [version, seed] of keys) {
            const generator = await privacyKit.createPersistentTokenGenerator({ service: 'agenthub', seed });
            const verifier = await privacyKit.createPersistentTokenVerifier({
                service: 'agenthub',
                publicKey: Uint8Array.from(generator.publicKey),
            });
            verifiers.set(version, verifier);
            if (version === activeVersion) activeGenerator = generator;
        }
        if (!activeGenerator) throw new Error('Active token generator is unavailable');
        this.tokens = { activeVersion, generator: activeGenerator, verifiers };

        this.cleanupTimer = setInterval(() => {
            void this.cleanup().catch(error => log({ module: 'auth', level: 'error' }, `Token cleanup failed: ${error}`));
        }, CLEANUP_INTERVAL);
        log({ module: 'auth' }, `Auth module initialized with key version ${activeVersion}`);
    }

    async createToken(userId: string, extras?: Record<string, unknown>): Promise<string> {
        if (!this.tokens) throw new Error('Auth module not initialized');

        const exp = Math.floor(Date.now() / 1000) + positiveInteger(process.env.AGENTHUB_TOKEN_TTL_SECONDS, DEFAULT_TOKEN_TTL_SECONDS);
        const token = await this.tokens.generator.new({
            user: userId,
            extras: {
                ...(extras ?? {}),
                exp,
                keyVersion: this.tokens.activeVersion,
            },
        } as any);
        const generatedClaims = decodeGeneratedTokenPayload(token);
        if (generatedClaims.exp !== exp || generatedClaims.keyVersion !== this.tokens.activeVersion) {
            throw new Error('Generated token claims do not match the active auth policy');
        }

        await db.authToken.create({ data: {
            id: generatedClaims.jti,
            accountId: userId,
            keyVersion: this.tokens.activeVersion,
            expiresAt: new Date(generatedClaims.exp * 1000),
        } });
        return token;
    }

    async verifyToken(token: string): Promise<{ userId: string; extras?: any } | null> {
        if (!this.tokens) throw new Error('Auth module not initialized');

        for (const [version, verifier] of this.tokens.verifiers) {
            try {
                const verified = await verifier.verify(token) as TokenPayload | null;
                const userId = verified?.user ?? verified?.sub;
                const tokenId = verified?.uuid ?? verified?.jti;
                const keyVersion = verified?.keyVersion ?? verified?.extras?.keyVersion;
                if (!verified || keyVersion !== version || typeof userId !== 'string' ||
                    typeof tokenId !== 'string') {
                    continue;
                }
                // privacy-kit delegates JWT validation (including exp) to jose.jwtVerify;
                // its normalized result intentionally omits standard exp/jti fields.
                const record = await db.authToken.findUnique({ where: { id: tokenId } });
                if (!record || record.accountId !== userId || record.keyVersion !== version ||
                    record.revokedAt || record.expiresAt.getTime() <= Date.now()) {
                    return null;
                }
                return { userId, extras: verified.extras };
            } catch {
                // A token may be signed by another configured key version.
            }
        }
        return null;
    }

    async invalidateUserTokens(userId: string): Promise<void> {
        await db.authToken.updateMany({ where: { accountId: userId, revokedAt: null }, data: { revokedAt: new Date() } });
        log({ module: 'auth' }, `Invalidated tokens for user: ${userId}`);
    }

    async invalidateToken(token: string): Promise<void> {
        if (!this.tokens) throw new Error('Auth module not initialized');
        for (const [version, verifier] of this.tokens.verifiers) {
            try {
                const verified = await verifier.verify(token) as TokenPayload | null;
                const tokenId = verified?.uuid ?? verified?.jti;
                const keyVersion = verified?.keyVersion ?? verified?.extras?.keyVersion;
                if (keyVersion === version && typeof tokenId === 'string') {
                    await db.authToken.updateMany({ where: { id: tokenId, revokedAt: null }, data: { revokedAt: new Date() } });
                    return;
                }
            } catch { /* try the next configured key */ }
        }
    }

    getCacheStats(): { size: number; oldestEntry: number | null } {
        return { size: 0, oldestEntry: null };
    }

    async cleanup(): Promise<void> {
        await db.authToken.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    }
}

export const auth = new AuthModule();
