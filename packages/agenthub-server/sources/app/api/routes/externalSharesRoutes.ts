import { z } from 'zod';
import { db } from '@/storage/db';
import { log } from '@/utils/log';
import type { Fastify } from '../types';
import { AccountQuotaError, createWithinAccountQuota, readAccountQuotas } from '../utils/accountQuotas';

const MAX_CIPHERTEXT_BYTES = 64 * 1024;
const MAX_CIPHERTEXT_BASE64_CHARS = Math.ceil(MAX_CIPHERTEXT_BYTES / 3) * 4;
const MIN_TTL_SECONDS = 5 * 60;
const MAX_TTL_SECONDS = 7 * 24 * 60 * 60;
const RETENTION_SECONDS = 30 * 24 * 60 * 60;
const accountQuotas = readAccountQuotas();

const shareIdSchema = z.string().uuid();
const ciphertextSchema = z.string()
    .min(1)
    .max(MAX_CIPHERTEXT_BASE64_CHARS)
    .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/)
    .refine((value) => Buffer.from(value, 'base64').byteLength <= MAX_CIPHERTEXT_BYTES, 'Ciphertext exceeds 64 KiB');
const createShareBodySchema = z.object({
    id: shareIdSchema,
    ciphertext: ciphertextSchema,
    scope: z.literal('selected-text'),
    expiresInSeconds: z.number().int().min(MIN_TTL_SECONDS).max(MAX_TTL_SECONDS),
}).strict();

const metadataSchema = z.object({
    id: z.string(),
    scope: z.literal('selected-text'),
    expiresAt: z.number(),
    revokedAt: z.number().nullable(),
    createdAt: z.number(),
});

function toMetadata(share: {
    id: string;
    scope: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
}) {
    return {
        id: share.id,
        scope: 'selected-text' as const,
        expiresAt: share.expiresAt.getTime(),
        revokedAt: share.revokedAt?.getTime() ?? null,
        createdAt: share.createdAt.getTime(),
    };
}

function setPrivateNoStoreHeaders(reply: any): void {
    reply.header('Cache-Control', 'no-store, private');
    reply.header('Pragma', 'no-cache');
    reply.header('Referrer-Policy', 'no-referrer');
    reply.header('X-Robots-Tag', 'noindex, nofollow');
}

export function externalSharesRoutes(app: Fastify, dependencies: { now?: () => Date } = {}) {
    const now = dependencies.now ?? (() => new Date());

    app.post('/v1/external-shares', {
        preHandler: app.authenticate,
        schema: {
            body: createShareBodySchema,
            response: {
                200: metadataSchema,
                409: z.object({ error: z.literal('share-id-conflict') }),
                429: z.object({
                    error: z.literal('quota-exceeded'),
                    resource: z.literal('externalShares'),
                    limit: z.number(),
                }),
                500: z.object({ error: z.literal('Failed to create external share') }),
            },
        },
    }, async (request, reply) => {
        const userId = request.userId;
        const { id, ciphertext, scope, expiresInSeconds } = request.body;
        const ciphertextBytes = Buffer.from(ciphertext, 'base64');
        try {
            const existing = await db.externalShare.findUnique({ where: { id } });
            if (existing) {
                if (
                    existing.accountId !== userId
                    || existing.scope !== scope
                    || !Buffer.from(existing.ciphertext).equals(ciphertextBytes)
                ) {
                    return reply.code(409).send({ error: 'share-id-conflict' });
                }
                return reply.send(toMetadata(existing));
            }

            const createdAt = now();
            const expiresAt = new Date(createdAt.getTime() + expiresInSeconds * 1000);
            const retentionCutoff = new Date(createdAt.getTime() - RETENTION_SECONDS * 1000);
            await db.externalShare.deleteMany({
                where: {
                    accountId: userId,
                    OR: [
                        { expiresAt: { lte: retentionCutoff } },
                        { revokedAt: { lte: retentionCutoff } },
                    ],
                },
            });
            let share;
            try {
                share = await createWithinAccountQuota({
                    resource: 'externalShares',
                    limit: accountQuotas.externalShares,
                    count: (tx) => tx.externalShare.count({
                        where: { accountId: userId, revokedAt: null, expiresAt: { gt: createdAt } },
                    }),
                    create: (tx) => tx.externalShare.create({
                        data: { id, accountId: userId, ciphertext: ciphertextBytes, scope, expiresAt },
                    }),
                });
            } catch (error) {
                if (error instanceof AccountQuotaError || (error instanceof Error && error.name === 'AccountQuotaError')) {
                    return reply.code(429).send({
                        error: 'quota-exceeded',
                        resource: 'externalShares',
                        limit: accountQuotas.externalShares,
                    });
                }
                throw error;
            }
            return reply.send(toMetadata(share));
        } catch (error) {
            log({ module: 'external-shares', level: 'error', userId }, `Failed to create external share: ${error}`);
            return reply.code(500).send({ error: 'Failed to create external share' });
        }
    });

    app.get('/v1/external-shares', {
        preHandler: app.authenticate,
        schema: {
            response: {
                200: z.array(metadataSchema),
                500: z.object({ error: z.literal('Failed to list external shares') }),
            },
        },
    }, async (request, reply) => {
        try {
            const shares = await db.externalShare.findMany({
                where: { accountId: request.userId },
                orderBy: { createdAt: 'desc' },
                take: 100,
                select: { id: true, scope: true, expiresAt: true, revokedAt: true, createdAt: true },
            });
            return reply.send(shares.map(toMetadata));
        } catch (error) {
            log({ module: 'external-shares', level: 'error', userId: request.userId }, `Failed to list external shares: ${error}`);
            return reply.code(500).send({ error: 'Failed to list external shares' });
        }
    });

    app.delete('/v1/external-shares/:id', {
        preHandler: app.authenticate,
        schema: {
            params: z.object({ id: shareIdSchema }),
            response: {
                200: metadataSchema,
                404: z.object({ error: z.literal('Share not found') }),
                500: z.object({ error: z.literal('Failed to revoke external share') }),
            },
        },
    }, async (request, reply) => {
        try {
            const existing = await db.externalShare.findFirst({
                where: { id: request.params.id, accountId: request.userId },
            });
            if (!existing) return reply.code(404).send({ error: 'Share not found' });
            const hasCiphertext = Buffer.from(existing.ciphertext).byteLength > 0;
            const share = !existing.revokedAt || hasCiphertext
                ? await db.externalShare.update({
                    where: { id: existing.id },
                    data: {
                        ...(existing.revokedAt ? {} : { revokedAt: now() }),
                        ...(hasCiphertext ? { ciphertext: Buffer.alloc(0) } : {}),
                    },
                })
                : existing;
            return reply.send(toMetadata(share));
        } catch (error) {
            log({ module: 'external-shares', level: 'error', userId: request.userId }, `Failed to revoke external share: ${error}`);
            return reply.code(500).send({ error: 'Failed to revoke external share' });
        }
    });

    app.get('/v1/public-shares/:id', {
        schema: {
            params: z.object({ id: shareIdSchema }),
            response: {
                200: z.object({
                    id: z.string(),
                    ciphertext: z.string(),
                    scope: z.literal('selected-text'),
                    expiresAt: z.number(),
                }),
                404: z.object({ error: z.literal('Share not found') }),
                500: z.object({ error: z.literal('Failed to get external share') }),
            },
        },
    }, async (request, reply) => {
        setPrivateNoStoreHeaders(reply);
        try {
            const share = await db.externalShare.findUnique({ where: { id: request.params.id } });
            if (!share) {
                return reply.code(404).send({ error: 'Share not found' });
            }
            if (share.revokedAt || share.expiresAt.getTime() <= now().getTime()) {
                if (Buffer.from(share.ciphertext).byteLength > 0) {
                    try {
                        await db.externalShare.update({
                            where: { id: share.id },
                            data: { ciphertext: Buffer.alloc(0) },
                        });
                    } catch (error) {
                        log({ module: 'external-shares', level: 'warn' }, `Failed to clear stale external share ciphertext: ${error}`);
                    }
                }
                return reply.code(404).send({ error: 'Share not found' });
            }
            return reply.send({
                id: share.id,
                ciphertext: Buffer.from(share.ciphertext).toString('base64'),
                scope: 'selected-text',
                expiresAt: share.expiresAt.getTime(),
            });
        } catch (error) {
            log({ module: 'external-shares', level: 'error' }, `Failed to get external share: ${error}`);
            return reply.code(500).send({ error: 'Failed to get external share' });
        }
    });
}
