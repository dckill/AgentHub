import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { state, db, createWithinAccountQuota } = vi.hoisted(() => {
    const state = {
        now: new Date('2026-07-16T00:00:00.000Z'),
        shares: [] as any[],
        quotaExceeded: false,
    };
    const db = {
        externalShare: {
            findUnique: vi.fn(async ({ where }: any) => state.shares.find((share) => share.id === where.id) ?? null),
            findFirst: vi.fn(async ({ where }: any) => state.shares.find((share) => (
                share.id === where.id && share.accountId === where.accountId
            )) ?? null),
            findMany: vi.fn(async ({ where, take }: any) => state.shares
                .filter((share) => share.accountId === where.accountId)
                .slice(0, take)),
            count: vi.fn(async ({ where }: any) => state.shares.filter((share) => share.accountId === where.accountId).length),
            deleteMany: vi.fn(async () => ({ count: 0 })),
            create: vi.fn(async ({ data }: any) => {
                const share = { ...data, revokedAt: null, createdAt: state.now, updatedAt: state.now };
                state.shares.push(share);
                return share;
            }),
            update: vi.fn(async ({ where, data }: any) => {
                const share = state.shares.find((candidate) => candidate.id === where.id);
                Object.assign(share, data, { updatedAt: state.now });
                return share;
            }),
        },
    };
    const createWithinAccountQuota = vi.fn(async ({ resource, limit, create }: any) => {
        if (state.quotaExceeded) {
            const error: any = new Error('quota');
            error.name = 'AccountQuotaError';
            error.resource = resource;
            error.limit = limit;
            throw error;
        }
        return create(db);
    });
    return { state, db, createWithinAccountQuota };
});

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));
vi.mock('../utils/accountQuotas', async () => {
    class AccountQuotaError extends Error {
        readonly name = 'AccountQuotaError';
        constructor(readonly resource: string, readonly limit: number) { super('quota'); }
    }
    return {
        AccountQuotaError,
        createWithinAccountQuota,
        readAccountQuotas: () => ({ externalShares: 50 }),
    };
});

import { externalSharesRoutes } from './externalSharesRoutes';

const shareId = '00000000-0000-4000-8000-000000000001';
const ciphertext = Buffer.from('nonce-and-authenticated-ciphertext').toString('base64');

async function createApp(userId = 'user-1') {
    const app = fastify({ bodyLimit: 1024 * 1024 });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any) => { request.userId = userId; });
    externalSharesRoutes(typed, { now: () => state.now });
    await typed.ready();
    return typed;
}

function seed(overrides: Record<string, unknown> = {}) {
    state.shares.push({
        id: shareId,
        accountId: 'user-1',
        ciphertext: Buffer.from('nonce-and-authenticated-ciphertext'),
        scope: 'selected-text',
        expiresAt: new Date('2026-07-17T00:00:00.000Z'),
        revokedAt: null,
        createdAt: state.now,
        updatedAt: state.now,
        ...overrides,
    });
}

describe('externalSharesRoutes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.shares = [];
        state.quotaExceeded = false;
        state.now = new Date('2026-07-16T00:00:00.000Z');
    });

    it('creates only selected-text ciphertext with a bounded TTL and never accepts a key', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/external-shares',
            payload: { id: shareId, ciphertext, scope: 'selected-text', expiresInSeconds: 86_400 },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            id: shareId,
            scope: 'selected-text',
            expiresAt: Date.parse('2026-07-17T00:00:00.000Z'),
            revokedAt: null,
        });
        expect(response.json()).not.toHaveProperty('ciphertext');
        expect(state.shares[0]).not.toHaveProperty('key');
        expect(db.externalShare.deleteMany).toHaveBeenCalledWith({
            where: {
                accountId: 'user-1',
                OR: [
                    { expiresAt: { lte: new Date('2026-06-16T00:00:00.000Z') } },
                    { revokedAt: { lte: new Date('2026-06-16T00:00:00.000Z') } },
                ],
            },
        });

        const withKey = await app.inject({
            method: 'POST', url: '/v1/external-shares',
            payload: { id: shareId, ciphertext, key: 'must-not-reach-server', scope: 'selected-text', expiresInSeconds: 86_400 },
        });
        expect(withKey.statusCode).toBe(400);
        await app.close();
    });

    it('rejects invalid scope, TTL and ciphertext larger than 64 KiB before persistence', async () => {
        const app = await createApp();
        for (const payload of [
            { id: shareId, ciphertext, scope: 'session', expiresInSeconds: 86_400 },
            { id: shareId, ciphertext, scope: 'selected-text', expiresInSeconds: 604_801 },
            { id: shareId, ciphertext: Buffer.alloc(65_537).toString('base64'), scope: 'selected-text', expiresInSeconds: 3_600 },
        ]) {
            const response = await app.inject({ method: 'POST', url: '/v1/external-shares', payload });
            expect(response.statusCode).toBe(400);
        }
        expect(db.externalShare.create).not.toHaveBeenCalled();
        await app.close();
    });

    it('is idempotent only for an identical owner payload and conflicts otherwise', async () => {
        seed();
        const app = await createApp();
        const identical = await app.inject({
            method: 'POST', url: '/v1/external-shares',
            payload: { id: shareId, ciphertext, scope: 'selected-text', expiresInSeconds: 3_600 },
        });
        expect(identical.statusCode).toBe(200);
        expect(db.externalShare.create).not.toHaveBeenCalled();

        const changed = await app.inject({
            method: 'POST', url: '/v1/external-shares',
            payload: { id: shareId, ciphertext: Buffer.from('different').toString('base64'), scope: 'selected-text', expiresInSeconds: 3_600 },
        });
        expect(changed.statusCode).toBe(409);

        state.shares[0].accountId = 'user-2';
        const otherOwner = await app.inject({
            method: 'POST', url: '/v1/external-shares',
            payload: { id: shareId, ciphertext, scope: 'selected-text', expiresInSeconds: 3_600 },
        });
        expect(otherOwner.statusCode).toBe(409);
        await app.close();
    });

    it('enforces the per-account quota without persisting ciphertext', async () => {
        state.quotaExceeded = true;
        const app = await createApp();
        const response = await app.inject({
            method: 'POST', url: '/v1/external-shares',
            payload: { id: shareId, ciphertext, scope: 'selected-text', expiresInSeconds: 3_600 },
        });
        expect(response.statusCode).toBe(429);
        expect(response.json()).toEqual({ error: 'quota-exceeded', resource: 'externalShares', limit: 50 });
        expect(state.shares).toHaveLength(0);
        await app.close();
    });

    it('lists owner metadata without ciphertext and revokes idempotently without cross-tenant access', async () => {
        seed();
        seed({ id: '00000000-0000-4000-8000-000000000002', accountId: 'user-2' });
        const app = await createApp();
        const list = await app.inject({ method: 'GET', url: '/v1/external-shares' });
        expect(list.statusCode).toBe(200);
        expect(list.json()).toHaveLength(1);
        expect(list.json()[0]).not.toHaveProperty('ciphertext');

        const revoked = await app.inject({ method: 'DELETE', url: `/v1/external-shares/${shareId}` });
        expect(revoked.statusCode).toBe(200);
        const revokedAt = revoked.json().revokedAt;
        expect(revokedAt).toBe(state.now.getTime());
        const repeated = await app.inject({ method: 'DELETE', url: `/v1/external-shares/${shareId}` });
        expect(repeated.statusCode).toBe(200);
        expect(repeated.json().revokedAt).toBe(revokedAt);

        const hidden = await app.inject({ method: 'DELETE', url: '/v1/external-shares/00000000-0000-4000-8000-000000000002' });
        expect(hidden.statusCode).toBe(404);
        await app.close();
    });

    it('publicly returns only active ciphertext with no-store headers and uses uniform 404 otherwise', async () => {
        seed();
        const app = await createApp();
        const active = await app.inject({ method: 'GET', url: `/v1/public-shares/${shareId}` });
        expect(active.statusCode).toBe(200);
        expect(active.json()).toEqual({
            id: shareId,
            ciphertext,
            scope: 'selected-text',
            expiresAt: Date.parse('2026-07-17T00:00:00.000Z'),
        });
        expect(active.headers['cache-control']).toContain('no-store');
        expect(active.headers['referrer-policy']).toBe('no-referrer');
        expect(active.headers['x-robots-tag']).toContain('noindex');

        for (const statePatch of [
            { revokedAt: state.now },
            { revokedAt: null, expiresAt: state.now },
        ]) {
            Object.assign(state.shares[0], statePatch);
            const response = await app.inject({ method: 'GET', url: `/v1/public-shares/${shareId}` });
            expect(response.statusCode).toBe(404);
            expect(response.json()).toEqual({ error: 'Share not found' });
        }
        const missing = await app.inject({ method: 'GET', url: '/v1/public-shares/00000000-0000-4000-8000-000000000099' });
        expect(missing.statusCode).toBe(404);
        expect(missing.json()).toEqual({ error: 'Share not found' });
        await app.close();
    });
});
