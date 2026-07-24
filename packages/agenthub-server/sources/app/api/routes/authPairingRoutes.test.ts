import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

type PairingRecord = {
    id: string;
    publicKey: string;
    pollingSecretHash?: string;
    expiresAt?: Date;
    consumedAt?: Date | null;
    response: string | null;
    responseAccountId: string | null;
};

const state = vi.hoisted(() => ({ account: null as PairingRecord | null }));
const { auth } = vi.hoisted(() => ({
    auth: { createToken: vi.fn(async () => 'issued-token') },
}));
const { db } = vi.hoisted(() => ({
    db: {
        account: { upsert: vi.fn() },
        terminalAuthRequest: {},
        accountAuthRequest: {
            upsert: vi.fn(async ({ create }: any) => {
                state.account ??= {
                    id: 'pair-1',
                    ...create,
                    response: null,
                    responseAccountId: null,
                    consumedAt: null,
                };
                return state.account;
            }),
            findUnique: vi.fn(async () => state.account),
            create: vi.fn(async ({ data }: any) => {
                state.account = {
                    id: 'pair-1',
                    ...data,
                    response: null,
                    responseAccountId: null,
                    consumedAt: null,
                };
                return state.account;
            }),
            update: vi.fn(async ({ data }: any) => {
                state.account = { ...state.account!, ...data };
                return state.account;
            }),
            updateMany: vi.fn(async ({ where, data }: any) => {
                const record = state.account;
                if (!record || record.consumedAt) return { count: 0 };
                if (where.pollingSecretHash !== undefined && record.pollingSecretHash !== where.pollingSecretHash) return { count: 0 };
                if (where.response === null && record.response !== null) return { count: 0 };
                state.account = { ...record, ...data };
                return { count: 1 };
            }),
        },
    },
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/app/auth/auth', () => ({ auth }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));

import { authRoutes } from './authRoutes';

const publicKey = Buffer.alloc(32, 7).toString('base64');
const pollingSecret = Buffer.alloc(32, 9).toString('base64');
const wrongSecret = Buffer.alloc(32, 8).toString('base64');

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any, reply: any) => {
        if (request.headers['x-user-id'] !== 'account-1') return reply.code(401).send({ error: 'Unauthorized' });
        request.userId = 'account-1';
    });
    authRoutes(typed);
    await typed.ready();
    return typed;
}

describe('account pairing lifecycle', () => {
    beforeEach(() => {
        state.account = null;
        vi.clearAllMocks();
    });

    it('does not disclose an approved response to a poller with the wrong secret', async () => {
        const app = await createApp();
        expect((await app.inject({ method: 'POST', url: '/v1/auth/account/request', payload: { publicKey, pollingSecret } })).statusCode).toBe(200);
        expect((await app.inject({ method: 'POST', url: '/v1/auth/account/response', headers: { 'x-user-id': 'account-1' }, payload: { publicKey, response: 'ciphertext' } })).statusCode).toBe(200);

        const wrong = await app.inject({
            method: 'POST',
            url: '/v1/auth/account/request',
            payload: { publicKey, pollingSecret: wrongSecret },
        });

        expect(wrong.statusCode).toBe(401);
        expect(wrong.json()).toEqual({ error: 'Invalid polling secret' });
        await app.close();
    });

    it('allows an approved response to be claimed exactly once', async () => {
        const app = await createApp();
        await app.inject({ method: 'POST', url: '/v1/auth/account/request', payload: { publicKey, pollingSecret } });
        await app.inject({ method: 'POST', url: '/v1/auth/account/response', headers: { 'x-user-id': 'account-1' }, payload: { publicKey, response: 'ciphertext' } });

        const first = await app.inject({ method: 'POST', url: '/v1/auth/account/request', payload: { publicKey, pollingSecret } });
        const replay = await app.inject({ method: 'POST', url: '/v1/auth/account/request', payload: { publicKey, pollingSecret } });

        expect(first.statusCode).toBe(200);
        expect(first.json()).toEqual({ state: 'authorized', token: 'issued-token', response: 'ciphertext' });
        expect(replay.statusCode).toBe(410);
        expect(replay.json()).toEqual({ error: 'Pairing request expired or already consumed' });
        expect(auth.createToken).toHaveBeenCalledTimes(1);
        await app.close();
    });

    it('rejects approval and polling after the five-minute request TTL', async () => {
        const app = await createApp();
        await app.inject({ method: 'POST', url: '/v1/auth/account/request', payload: { publicKey, pollingSecret } });
        state.account!.expiresAt = new Date(Date.now() - 1);

        const approval = await app.inject({
            method: 'POST',
            url: '/v1/auth/account/response',
            headers: { 'x-user-id': 'account-1' },
            payload: { publicKey, response: 'ciphertext' },
        });
        const poll = await app.inject({ method: 'POST', url: '/v1/auth/account/request', payload: { publicKey, pollingSecret } });

        expect(approval.statusCode).toBe(410);
        expect(poll.statusCode).toBe(410);
        expect(auth.createToken).not.toHaveBeenCalled();
        await app.close();
    });
});
