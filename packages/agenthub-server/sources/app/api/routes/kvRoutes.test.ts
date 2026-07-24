import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { kvGet, kvList, kvBulkGet, kvMutate } = vi.hoisted(() => ({
    kvGet: vi.fn(),
    kvList: vi.fn(),
    kvBulkGet: vi.fn(),
    kvMutate: vi.fn(),
}));

vi.mock('@/app/kv/kvGet', () => ({ kvGet }));
vi.mock('@/app/kv/kvList', () => ({ kvList }));
vi.mock('@/app/kv/kvBulkGet', () => ({ kvBulkGet }));
vi.mock('@/app/kv/kvMutate', () => ({ kvMutate }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));

import { kvRoutes } from './kvRoutes';
import { AccountQuotaError } from '../utils/accountQuotas';

async function createApp() {
    const app = fastify({ bodyLimit: 8 * 1024 * 1024 });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any, reply: any) => {
        const userId = request.headers['x-user-id'];
        if (typeof userId !== 'string') return reply.code(401).send({ error: 'Unauthorized' });
        request.userId = userId;
    });
    kvRoutes(typed);
    await typed.ready();
    return typed;
}

describe('kvRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('requires authentication before KV access', async () => {
        const app = await createApp();
        const response = await app.inject({ method: 'GET', url: '/v1/kv/key' });
        expect(response.statusCode).toBe(401);
        expect(kvGet).not.toHaveBeenCalled();
        await app.close();
    });

    it('gets and lists values for the authenticated user', async () => {
        kvGet.mockResolvedValueOnce({ key: 'a', value: '1', version: 2 });
        kvList.mockResolvedValueOnce({ items: [{ key: 'a', value: '1', version: 2 }] });
        const app = await createApp();

        expect((await app.inject({ method: 'GET', url: '/v1/kv/a', headers: { 'x-user-id': 'u1' } })).json()).toEqual({ key: 'a', value: '1', version: 2 });
        expect((await app.inject({ method: 'GET', url: '/v1/kv?prefix=a&limit=10', headers: { 'x-user-id': 'u1' } })).json()).toEqual({ items: [{ key: 'a', value: '1', version: 2 }] });
        expect(kvGet).toHaveBeenCalledWith({ uid: 'u1' }, 'a');
        expect(kvList).toHaveBeenCalledWith({ uid: 'u1' }, { prefix: 'a', limit: 10 });
        await app.close();
    });

    it('maps missing keys and mutation conflicts to protocol status codes', async () => {
        kvGet.mockResolvedValueOnce(null);
        kvMutate.mockResolvedValueOnce({ success: false, errors: [{ key: 'a', error: 'version-mismatch', version: 2, value: 'old' }] });
        const app = await createApp();

        expect((await app.inject({ method: 'GET', url: '/v1/kv/a', headers: { 'x-user-id': 'u1' } })).statusCode).toBe(404);
        const conflict = await app.inject({
            method: 'POST',
            url: '/v1/kv',
            headers: { 'x-user-id': 'u1' },
            payload: { mutations: [{ key: 'a', value: 'new', version: 1 }] },
        });
        expect(conflict.statusCode).toBe(409);
        expect(conflict.json()).toEqual({ success: false, errors: [{ key: 'a', error: 'version-mismatch', version: 2, value: 'old' }] });
        await app.close();
    });

    it('bulk gets and mutates values', async () => {
        kvBulkGet.mockResolvedValueOnce({ values: [{ key: 'a', value: '1', version: 1 }] });
        kvMutate.mockResolvedValueOnce({ success: true, results: [{ key: 'a', version: 2 }] });
        const app = await createApp();

        expect((await app.inject({ method: 'POST', url: '/v1/kv/bulk', headers: { 'x-user-id': 'u1' }, payload: { keys: ['a'] } })).json()).toEqual({ values: [{ key: 'a', value: '1', version: 1 }] });
        expect((await app.inject({ method: 'POST', url: '/v1/kv', headers: { 'x-user-id': 'u1' }, payload: { mutations: [{ key: 'a', value: '2', version: 1 }] } })).json()).toEqual({ success: true, results: [{ key: 'a', version: 2 }] });
        await app.close();
    });

    it('rejects oversized keys and encrypted values before mutation', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/kv',
            headers: { 'x-user-id': 'u1' },
            payload: { mutations: [{ key: 'k'.repeat(513), value: 'v'.repeat(1024 * 1024 + 1), version: -1 }] },
        });

        expect(response.statusCode).toBe(400);
        expect(kvMutate).not.toHaveBeenCalled();
        await app.close();
    });

    it('maps account KV quota exhaustion to 429', async () => {
        kvMutate.mockRejectedValue(new AccountQuotaError('kv', 10_000));
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/kv',
            headers: { 'x-user-id': 'u1' },
            payload: { mutations: [{ key: 'new-key', value: 'dmFsdWU=', version: -1 }] },
        });

        expect(response.statusCode).toBe(429);
        expect(response.json()).toEqual({ error: 'quota-exceeded', resource: 'kv', limit: 10_000 });
        await app.close();
    });
});
