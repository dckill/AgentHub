import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { db } = vi.hoisted(() => ({
    db: {
        account: {
            findUniqueOrThrow: vi.fn(),
            findUnique: vi.fn(),
            updateMany: vi.fn(),
        },
        session: {
            findFirst: vi.fn(),
        },
        usageReport: {
            findMany: vi.fn(),
        },
    },
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/storage/files', () => ({ getPublicUrl: vi.fn((path: string) => `https://files.test/${path}`) }));
vi.mock('@/storage/seq', () => ({ allocateUserSeq: vi.fn() }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));
vi.mock('@/utils/randomKeyNaked', () => ({ randomKeyNaked: vi.fn(() => 'update-id') }));
vi.mock('@/app/events/eventRouter', () => ({
    eventRouter: { emitUpdate: vi.fn() },
    buildUpdateAccountUpdate: vi.fn(),
}));

import { accountRoutes } from './accountRoutes';

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any, reply: any) => {
        const userId = request.headers['x-user-id'];
        if (typeof userId !== 'string') {
            return reply.code(401).send({ error: 'Unauthorized' });
        }
        request.userId = userId;
    });
    accountRoutes(typed);
    await typed.ready();
    return typed;
}

describe('accountRoutes usage query', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('queries and buckets usage reports by updatedAt', async () => {
        const app = await createApp();
        const updatedAt = new Date('2026-06-28T10:35:00Z');
        db.usageReport.findMany.mockResolvedValue([{
            data: {
                tokens: {
                    total: 17,
                    input: 10,
                    output: 5,
                    cache_read: 2,
                },
                cost: {
                    total: 0.001,
                },
            },
            createdAt: new Date('2026-06-20T10:35:00Z'),
            updatedAt,
        }]);

        const response = await app.inject({
            method: 'POST',
            url: '/v1/usage/query',
            headers: { 'x-user-id': 'u1' },
            payload: {
                startTime: Date.parse('2026-06-28T00:00:00Z') / 1000,
                endTime: Date.parse('2026-06-28T23:59:59Z') / 1000,
                groupBy: 'hour',
            },
        });

        expect(response.statusCode).toBe(200);
        expect(db.usageReport.findMany).toHaveBeenCalledWith({
            where: {
                accountId: 'u1',
                updatedAt: {
                    gte: new Date('2026-06-28T00:00:00Z'),
                    lte: new Date('2026-06-28T23:59:59Z'),
                },
            },
            orderBy: {
                updatedAt: 'desc',
            },
        });
        expect(response.json()).toMatchObject({
            usage: [{
                timestamp: Date.parse('2026-06-28T10:00:00Z') / 1000,
                tokens: {
                    total: 17,
                    input: 10,
                    output: 5,
                    cache_read: 2,
                },
                cost: {
                    total: 0.001,
                },
                reportCount: 1,
            }],
            totalReports: 1,
        });

        await app.close();
    });
});
