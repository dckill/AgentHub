import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { db } = vi.hoisted(() => ({
    db: {
        accountPushToken: {
            upsert: vi.fn(),
            deleteMany: vi.fn(),
            findMany: vi.fn(),
        },
        session: {
            findFirst: vi.fn(),
        },
    },
}));

const { eventRouter } = vi.hoisted(() => ({
    eventRouter: { getActiveUiDeviceIds: vi.fn() },
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/app/events/eventRouter', () => ({ eventRouter }));

import { pushRoutes } from './pushRoutes';

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any) => { request.userId = 'user-1'; });
    pushRoutes(typed);
    await typed.ready();
    return typed;
}

describe('pushRoutes', () => {
    beforeEach(() => vi.clearAllMocks());

    it('rejects blank push tokens before persistence', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/push-tokens',
            payload: { token: '   ' },
        });

        expect(response.statusCode).toBe(400);
        expect(db.accountPushToken.upsert).not.toHaveBeenCalled();
        await app.close();
    });

    it('filters the active device while retaining observer and legacy targets', async () => {
        db.session.findFirst.mockResolvedValue({ activeDeviceId: 'device-a' });
        eventRouter.getActiveUiDeviceIds.mockResolvedValue(new Set(['device-a']));
        db.accountPushToken.findMany.mockResolvedValue([
            { id: 'active', token: 'ExponentPushToken[active]', deviceId: 'device-a', createdAt: new Date(1), updatedAt: new Date(2) },
            { id: 'observer', token: 'ExponentPushToken[observer]', deviceId: 'device-b', createdAt: new Date(1), updatedAt: new Date(2) },
            { id: 'legacy', token: 'ExponentPushToken[legacy]', deviceId: null, createdAt: new Date(1), updatedAt: new Date(2) },
        ]);
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/push-tokens?sessionId=session-1' });

        expect(response.statusCode).toBe(200);
        expect(response.json().tokens.map((token: { id: string }) => token.id)).toEqual(['observer', 'legacy']);
        expect(db.session.findFirst).toHaveBeenCalledWith({
            where: { id: 'session-1', accountId: 'user-1' },
            select: { activeDeviceId: true },
        });
        await app.close();
    });

    it('does not suppress the active-device token without active UI presence proof', async () => {
        db.session.findFirst.mockResolvedValue({ activeDeviceId: 'device-a' });
        eventRouter.getActiveUiDeviceIds.mockResolvedValue(new Set());
        db.accountPushToken.findMany.mockResolvedValue([
            { id: 'active', token: 'ExponentPushToken[active]', deviceId: 'device-a', createdAt: new Date(1), updatedAt: new Date(2) },
            { id: 'observer', token: 'ExponentPushToken[observer]', deviceId: 'device-b', createdAt: new Date(1), updatedAt: new Date(2) },
        ]);
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/push-tokens?sessionId=session-1' });

        expect(response.statusCode).toBe(200);
        expect(response.json().tokens.map((token: { id: string }) => token.id)).toEqual(['active', 'observer']);
        expect(eventRouter.getActiveUiDeviceIds).toHaveBeenCalledWith('user-1');
        await app.close();
    });

    it('fails open for push targeting when the presence lookup is unavailable', async () => {
        db.session.findFirst.mockResolvedValue({ activeDeviceId: 'device-a' });
        eventRouter.getActiveUiDeviceIds.mockRejectedValue(new Error('presence unavailable'));
        db.accountPushToken.findMany.mockResolvedValue([
            { id: 'active', token: 'ExponentPushToken[active]', deviceId: 'device-a', createdAt: new Date(1), updatedAt: new Date(2) },
        ]);
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/push-tokens?sessionId=session-1' });

        expect(response.statusCode).toBe(200);
        expect(response.json().tokens.map((token: { id: string }) => token.id)).toEqual(['active']);
        await app.close();
    });

    it('loads all account tokens before applying presence-dependent suppression', async () => {
        db.session.findFirst.mockResolvedValue({ activeDeviceId: 'device-a' });
        eventRouter.getActiveUiDeviceIds.mockResolvedValue(new Set());
        db.accountPushToken.findMany.mockResolvedValue([]);
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/push-tokens?sessionId=session-1' });

        expect(response.statusCode).toBe(200);
        expect(db.accountPushToken.findMany).toHaveBeenCalledWith({
            where: { accountId: 'user-1' },
            orderBy: { createdAt: 'desc' },
        });
        await app.close();
    });
});
