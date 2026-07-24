import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { db } = vi.hoisted(() => ({
    db: {
        session: { findFirst: vi.fn() },
        machine: { findFirst: vi.fn() },
        accessKey: {
            findUnique: vi.fn(),
            create: vi.fn(),
            updateMany: vi.fn(),
        },
    },
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));

import { accessKeysRoutes } from './accessKeysRoutes';

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any, reply: any) => {
        const userId = request.headers['x-user-id'];
        if (typeof userId !== 'string') return reply.code(401).send({ error: 'Unauthorized' });
        request.userId = userId;
    });
    accessKeysRoutes(typed);
    await typed.ready();
    return typed;
}

function seedOwnership() {
    db.session.findFirst.mockResolvedValue({ id: 's1' });
    db.machine.findFirst.mockResolvedValue({ id: 'm1' });
}

describe('accessKeysRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns 404 when session or machine does not belong to the user', async () => {
        db.session.findFirst.mockResolvedValue(null);
        db.machine.findFirst.mockResolvedValue({ id: 'm1' });
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/access-keys/s1/m1', headers: { 'x-user-id': 'u1' } });

        expect(response.statusCode).toBe(404);
        expect(db.accessKey.findUnique).not.toHaveBeenCalled();
        await app.close();
    });

    it('gets an existing access key after ownership validation', async () => {
        seedOwnership();
        db.accessKey.findUnique.mockResolvedValue({ data: 'ciphertext', dataVersion: 3, createdAt: new Date(10), updatedAt: new Date(20) });
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/access-keys/s1/m1', headers: { 'x-user-id': 'u1' } });

        expect(response.json()).toEqual({ accessKey: { data: 'ciphertext', dataVersion: 3, createdAt: 10, updatedAt: 20 } });
        expect(db.accessKey.findUnique).toHaveBeenCalledWith({ where: { accountId_machineId_sessionId: { accountId: 'u1', machineId: 'm1', sessionId: 's1' } } });
        await app.close();
    });

    it('creates a new access key when no version is supplied', async () => {
        seedOwnership();
        db.accessKey.findUnique.mockResolvedValue(null);
        db.accessKey.create.mockResolvedValue({ data: 'new-data', dataVersion: 1, createdAt: new Date(10), updatedAt: new Date(20) });
        const app = await createApp();

        const response = await app.inject({ method: 'POST', url: '/v1/access-keys/s1/m1', headers: { 'x-user-id': 'u1' }, payload: { data: 'new-data' } });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ success: true, accessKey: { data: 'new-data', dataVersion: 1, createdAt: 10, updatedAt: 20 } });
        expect(db.accessKey.create).toHaveBeenCalledWith({ data: { accountId: 'u1', machineId: 'm1', sessionId: 's1', data: 'new-data', dataVersion: 1 } });
        await app.close();
    });

    it('reports version mismatch without mutating stale writes', async () => {
        seedOwnership();
        db.accessKey.findUnique.mockResolvedValue({ data: 'current', dataVersion: 4 });
        const app = await createApp();

        const response = await app.inject({ method: 'POST', url: '/v1/access-keys/s1/m1', headers: { 'x-user-id': 'u1' }, payload: { data: 'new', expectedVersion: 3 } });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ success: false, error: 'version-mismatch', currentVersion: 4, currentData: 'current' });
        expect(db.accessKey.updateMany).not.toHaveBeenCalled();
        await app.close();
    });

    it('updates when expectedVersion matches', async () => {
        seedOwnership();
        db.accessKey.findUnique.mockResolvedValue({ data: 'current', dataVersion: 4 });
        db.accessKey.updateMany.mockResolvedValue({ count: 1 });
        const app = await createApp();

        const response = await app.inject({ method: 'POST', url: '/v1/access-keys/s1/m1', headers: { 'x-user-id': 'u1' }, payload: { data: 'new', expectedVersion: 4 } });

        expect(response.json()).toEqual({ success: true, version: 5 });
        expect(db.accessKey.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            where: { accountId: 'u1', machineId: 'm1', sessionId: 's1', dataVersion: 4 },
            data: expect.objectContaining({ data: 'new', dataVersion: 5 }),
        }));
        await app.close();
    });
});
