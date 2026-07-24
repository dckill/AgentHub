import { beforeEach, describe, expect, it, vi } from 'vitest';
import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import type { Fastify } from '../types';

const { accountFindUnique, accountSyncEventFindMany } = vi.hoisted(() => ({
    accountFindUnique: vi.fn(),
    accountSyncEventFindMany: vi.fn(),
}));

vi.mock('@/storage/db', () => ({
    db: {
        account: {
            findUnique: accountFindUnique,
        },
        accountSyncEvent: {
            findMany: accountSyncEventFindMany,
        },
    },
}));

import { v4SyncRoutes } from './v4SyncRoutes';

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

    v4SyncRoutes(typed);
    await typed.ready();
    return typed;
}

describe('v4SyncRoutes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('rejects unauthenticated sync requests', async () => {
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: '/v4/sync?after_seq=0',
        });

        expect(response.statusCode).toBe(401);
        expect(accountFindUnique).not.toHaveBeenCalled();
        expect(accountSyncEventFindMany).not.toHaveBeenCalled();
        await app.close();
    });

    it.each(['-1', '1.5', 'not-a-number'])('rejects invalid after_seq=%s', async (afterSeq) => {
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: `/v4/sync?after_seq=${afterSeq}`,
            headers: { 'x-user-id': 'user-1' },
        });

        expect(response.statusCode).toBe(400);
        expect(accountFindUnique).not.toHaveBeenCalled();
        expect(accountSyncEventFindMany).not.toHaveBeenCalled();
        await app.close();
    });

    it('returns current cursor and no snapshot requirement when cursor is current', async () => {
        accountFindUnique.mockResolvedValueOnce({ seq: 12 });
        accountSyncEventFindMany.mockResolvedValueOnce([]);
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: '/v4/sync?after_seq=12',
            headers: { 'x-user-id': 'user-1' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ cursor: 12, events: [], requiresSnapshot: false });
        await app.close();
    });

    it('returns durable events when the cursor range is contiguous', async () => {
        accountFindUnique.mockResolvedValueOnce({ seq: 11 });
        accountSyncEventFindMany.mockResolvedValueOnce([
            { seq: 11, type: 'message-created', payload: { sessionId: 's1', messageId: 'm1', sessionSeq: 3 } },
        ]);
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: '/v4/sync?after_seq=10',
            headers: { 'x-user-id': 'user-1' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            cursor: 11,
            events: [{ type: 'message-created', seq: 11, sessionId: 's1', messageId: 'm1', sessionSeq: 3 }],
            requiresSnapshot: false,
        });
        await app.close();
    });

    it('asks clients to fall back to snapshot when the durable log has gaps', async () => {
        accountFindUnique.mockResolvedValueOnce({ seq: 20 });
        accountSyncEventFindMany.mockResolvedValueOnce([]);
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: '/v4/sync?after_seq=10',
            headers: { 'x-user-id': 'user-1' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({ cursor: 20, events: [], requiresSnapshot: true });
        await app.close();
    });

    it('asks clients to fall back to snapshot when returned events are not contiguous', async () => {
        accountFindUnique.mockResolvedValueOnce({ seq: 12 });
        accountSyncEventFindMany.mockResolvedValueOnce([
            { seq: 12, type: 'message-created', payload: { sessionId: 's1', messageId: 'm1', sessionSeq: 3 } },
        ]);
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: '/v4/sync?after_seq=10',
            headers: { 'x-user-id': 'user-1' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            cursor: 12,
            events: [],
            requiresSnapshot: true,
        });
        await app.close();
    });

    it('does not return partial events when the backlog is larger than one sync page', async () => {
        accountFindUnique.mockResolvedValueOnce({ seq: 600 });
        accountSyncEventFindMany.mockResolvedValueOnce(
            Array.from({ length: 500 }, (_, index) => ({
                seq: index + 1,
                type: 'message-created',
                payload: { sessionId: 's1', messageId: `m${index + 1}`, sessionSeq: index + 1 },
            })),
        );
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: '/v4/sync?after_seq=0',
            headers: { 'x-user-id': 'user-1' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toEqual({
            cursor: 600,
            events: [],
            requiresSnapshot: true,
        });
        await app.close();
    });
});
