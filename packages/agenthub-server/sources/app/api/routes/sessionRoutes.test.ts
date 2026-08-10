import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { db, activityCache } = vi.hoisted(() => ({
    db: {
        session: {
            findMany: vi.fn(),
            findFirst: vi.fn(),
            create: vi.fn(),
            count: vi.fn(),
            update: vi.fn(),
            updateMany: vi.fn(),
        },
        $transaction: vi.fn(),
    },
    activityCache: { invalidateSession: vi.fn(), clearSessionUpdates: vi.fn(), resumeSessionUpdates: vi.fn() },
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));
vi.mock('@/app/events/eventRouter', () => ({
    eventRouter: { emitUpdate: vi.fn(), emitEphemeral: vi.fn() },
    buildNewSessionUpdate: vi.fn(),
    buildSessionActivityEphemeral: vi.fn(),
}));
vi.mock('@/storage/seq', () => ({ allocateUserSeq: vi.fn() }));
vi.mock('@/utils/randomKeyNaked', () => ({ randomKeyNaked: vi.fn(() => 'update-id') }));
vi.mock('@/app/session/sessionDelete', () => ({ sessionDelete: vi.fn() }));
vi.mock('@/app/presence/sessionCache', () => ({ activityCache }));

import { sessionRoutes } from './sessionRoutes';

async function createApp() {
    const app = fastify({ bodyLimit: 8 * 1024 * 1024 });
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
    sessionRoutes(typed);
    await typed.ready();
    return typed;
}

describe('sessionRoutes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.session.count.mockResolvedValue(0);
        db.$transaction.mockImplementation(async (callback: any) => callback(db));
    });

    it('returns persisted thinking state in the session list', async () => {
        db.session.findMany.mockResolvedValue([{
            id: 's1',
            seq: 7,
            createdAt: new Date(1000),
            updatedAt: new Date(2000),
            metadata: 'metadata-ciphertext',
            metadataVersion: 2,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            active: true,
            lastActiveAt: new Date(3000),
            thinking: true,
            thinkingAt: new Date(2500),
        }]);
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: '/v1/sessions',
            headers: { 'x-user-id': 'u1' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().sessions[0]).toMatchObject({
            id: 's1',
            active: true,
            activeAt: 3000,
            thinking: true,
            thinkingAt: 2500,
        });
        expect(db.session.findMany).toHaveBeenCalledWith(expect.objectContaining({
            select: expect.objectContaining({
                thinking: true,
                thinkingAt: true,
            }),
        }));
        expect(db.session.findMany.mock.calls[0][0]).not.toHaveProperty('take');
        await app.close();
    });

    it('rejects oversized encrypted session metadata before database access', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions',
            headers: { 'x-user-id': 'u1' },
            payload: { tag: 'tag', metadata: 'm'.repeat(2 * 1024 * 1024 + 1) },
        });

        expect(response.statusCode).toBe(400);
        expect(db.session.findFirst).not.toHaveBeenCalled();
        await app.close();
    });

    it('returns 429 before sequence allocation and creation when the session quota is full', async () => {
        db.session.count.mockResolvedValue(10_000);
        db.session.create.mockResolvedValue({
            id: 'new-session', seq: 0, metadata: 'metadata', metadataVersion: 0,
            agentState: null, agentStateVersion: 0, dataEncryptionKey: null,
            active: true, lastActiveAt: new Date(1), thinking: false, thinkingAt: null,
            createdAt: new Date(1), updatedAt: new Date(1),
        });
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions',
            headers: { 'x-user-id': 'u1' },
            payload: { tag: 'new-tag', metadata: 'metadata' },
        });

        expect(response.statusCode).toBe(429);
        expect(response.json()).toEqual({ error: 'quota-exceeded', resource: 'sessions', limit: 10_000 });
        expect(db.session.create).not.toHaveBeenCalled();
        await app.close();
    });

    it('returns a single session by id', async () => {
        db.session.findFirst.mockResolvedValue({
            id: 's1',
            seq: 7,
            createdAt: new Date(1000),
            updatedAt: new Date(2000),
            metadata: 'metadata-ciphertext',
            metadataVersion: 2,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            active: true,
            lastActiveAt: new Date(3000),
            thinking: false,
            thinkingAt: null,
        });
        const app = await createApp();

        const response = await app.inject({
            method: 'GET',
            url: '/v1/sessions/s1',
            headers: { 'x-user-id': 'u1' },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json().session).toMatchObject({
            id: 's1',
            seq: 7,
            active: true,
            activeAt: 3000,
            thinking: false,
            thinkingAt: null,
        });
        expect(db.session.findFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: { accountId: 'u1', id: 's1' },
        }));
        await app.close();
    });

    it('resumes heartbeat updates when an existing tagged session starts again', async () => {
        db.session.findFirst.mockResolvedValue({
            id: 's1',
            seq: 7,
            metadata: 'metadata-ciphertext',
            metadataVersion: 2,
            agentState: null,
            agentStateVersion: 0,
            dataEncryptionKey: null,
            active: false,
            lastActiveAt: new Date(3000),
            thinking: false,
            thinkingAt: null,
            createdAt: new Date(1000),
            updatedAt: new Date(2000),
        });
        const app = await createApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions',
            headers: { 'x-user-id': 'u1' },
            payload: { tag: 'existing-tag', metadata: 'metadata-ciphertext' },
        });

        expect(response.statusCode).toBe(200);
        expect(activityCache.resumeSessionUpdates).toHaveBeenCalledWith('s1');
        await app.close();
    });

    it('invalidates cached heartbeats when explicitly archiving a session', async () => {
        db.session.updateMany.mockResolvedValue({ count: 1 });
        const app = await createApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions/s1/archive',
            headers: { 'x-user-id': 'u1' },
        });

        expect(response.statusCode).toBe(200);
        expect(db.session.updateMany).toHaveBeenCalledWith({
            where: { id: 's1', accountId: 'u1' },
            data: { active: false, lastActiveAt: expect.any(Date), thinking: false, thinkingAt: expect.any(Date) },
        });
        expect(activityCache.clearSessionUpdates).toHaveBeenCalledWith('s1');
        await app.close();
    });

    it('atomically archives encrypted metadata when the daemon supplies the expected version', async () => {
        db.session.updateMany.mockResolvedValue({ count: 1 });
        const app = await createApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/sessions/s1/archive',
            headers: { 'x-user-id': 'u1' },
            payload: {
                metadata: 'encrypted-archived-metadata',
                expectedMetadataVersion: 7,
            },
        });

        expect(response.statusCode).toBe(200);
        expect(db.session.updateMany).toHaveBeenCalledWith({
            where: { id: 's1', accountId: 'u1', metadataVersion: 7 },
            data: {
                active: false,
                lastActiveAt: expect.any(Date),
                thinking: false,
                thinkingAt: expect.any(Date),
                metadata: 'encrypted-archived-metadata',
                metadataVersion: 8,
            },
        });
        expect(activityCache.clearSessionUpdates).toHaveBeenCalledWith('s1');
        await app.close();
    });
});
