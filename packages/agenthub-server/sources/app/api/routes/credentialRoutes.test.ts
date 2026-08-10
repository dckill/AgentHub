import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { db, encryptString, decryptString, randomKey, log } = vi.hoisted(() => ({
    db: {
        managedCredential: {
            create: vi.fn(),
            count: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
            update: vi.fn(),
            deleteMany: vi.fn(),
        },
        machine: { findFirst: vi.fn() },
        session: { findFirst: vi.fn() },
        $transaction: vi.fn(),
    },
    encryptString: vi.fn((path: string[], value: string) => Buffer.from(`${path.join('/')}:${value}`)),
    decryptString: vi.fn((path: string[], value: Uint8Array) => Buffer.from(value).toString().slice(`${path.join('/')}:`.length)),
    randomKey: vi.fn(() => 'cred-1'),
    log: vi.fn(),
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/modules/encrypt', () => ({ encryptString, decryptString }));
vi.mock('@/utils/randomKey', () => ({ randomKey }));
vi.mock('@/utils/log', () => ({ log }));

import { credentialRoutes } from './credentialRoutes';

const now = new Date('2026-05-07T00:00:00.000Z');

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
    credentialRoutes(typed);
    await typed.ready();
    return typed;
}

function credential(overrides: Partial<any> = {}) {
    return {
        id: 'cred-1',
        label: 'Claude',
        agent: 'claude',
        apiKey: Buffer.from('user/u1/credentials/cred-1/apiKey:api-key'),
        baseUrl: Buffer.from('user/u1/credentials/cred-1/baseUrl:https://api.example.com'),
        modelOverrides: null,
        lastUsedAt: null,
        createdAt: now,
        updatedAt: now,
        ...overrides,
    };
}

describe('credentialRoutes', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.managedCredential.count.mockResolvedValue(0);
        db.$transaction.mockImplementation(async (callback: any) => callback(db));
    });

    it('creates credentials with encrypted secrets and normalized baseUrl', async () => {
        db.managedCredential.create.mockImplementation(async (args: any) => credential({
            label: args.data.label,
            agent: args.data.agent,
            baseUrl: args.data.baseUrl,
            modelOverrides: args.data.modelOverrides ?? null,
        }));
        const app = await createApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/credentials',
            headers: { 'x-user-id': 'u1' },
            payload: { label: 'Claude', agent: 'claude', apiKey: 'api-key', baseUrl: ' https://api.example.com ', modelOverrides: { ANTHROPIC_MODEL: ' sonnet ' } },
        });

        expect(response.statusCode).toBe(200);
        expect(db.managedCredential.create).toHaveBeenCalledWith({ data: expect.objectContaining({
            id: 'cred-1',
            accountId: 'u1',
            label: 'Claude',
            agent: 'claude',
            modelOverrides: { ANTHROPIC_MODEL: 'sonnet' },
        }) });
        expect(encryptString).toHaveBeenCalledWith(['user', 'u1', 'credentials', 'cred-1', 'apiKey'], 'api-key');
        expect(encryptString).toHaveBeenCalledWith(['user', 'u1', 'credentials', 'cred-1', 'baseUrl'], 'https://api.example.com');
        expect(response.json().credential).toMatchObject({ id: 'cred-1', hasApiKey: true, baseUrl: 'https://api.example.com' });
        await app.close();
    });

    it('rejects unsupported model override keys', async () => {
        const app = await createApp();

        const response = await app.inject({
            method: 'POST',
            url: '/v1/credentials',
            headers: { 'x-user-id': 'u1' },
            payload: { label: 'Codex', agent: 'codex', apiKey: 'key', modelOverrides: { OPENAI_MODEL: 'gpt' } },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toEqual({ error: 'Unsupported model override: OPENAI_MODEL' });
        expect(db.managedCredential.create).not.toHaveBeenCalled();
        await app.close();
    });

    it('rejects oversized credential secrets and URLs before encryption', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/credentials',
            headers: { 'x-user-id': 'u1' },
            payload: { label: 'Claude', agent: 'claude', apiKey: 'k'.repeat(64 * 1024 + 1), baseUrl: `https://example.com/${'x'.repeat(2048)}` },
        });

        expect(response.statusCode).toBe(400);
        expect(encryptString).not.toHaveBeenCalled();
        await app.close();
    });

    it('returns 429 before encryption when the account credential quota is full', async () => {
        db.managedCredential.count.mockResolvedValue(100);
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/credentials',
            headers: { 'x-user-id': 'u1' },
            payload: { label: 'Claude', agent: 'claude', apiKey: 'key' },
        });

        expect(response.statusCode).toBe(429);
        expect(response.json()).toEqual({ error: 'quota-exceeded', resource: 'credentials', limit: 100 });
        expect(encryptString).not.toHaveBeenCalled();
        expect(db.managedCredential.create).not.toHaveBeenCalled();
        await app.close();
    });

    it('lists credentials without exposing api keys', async () => {
        db.managedCredential.findMany.mockResolvedValue([credential()]);
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/credentials', headers: { 'x-user-id': 'u1' } });

        expect(response.json()).toEqual({ credentials: [expect.objectContaining({ id: 'cred-1', hasApiKey: true, baseUrl: 'https://api.example.com' })] });
        expect(JSON.stringify(response.json())).not.toContain('api-key');
        await app.close();
    });

    it('issues env vars only after credential and context ownership checks', async () => {
        db.managedCredential.findFirst.mockResolvedValue(credential({ modelOverrides: { ANTHROPIC_MODEL: 'sonnet' } }));
        db.machine.findFirst.mockResolvedValue({ id: 'm1' });
        db.session.findFirst.mockResolvedValue({ id: 's1' });
        db.managedCredential.update.mockResolvedValue(credential());
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/credentials/cred-1/env-vars?machineId=m1&sessionId=s1', headers: { 'x-user-id': 'u1' } });

        expect(response.json()).toEqual({ envVars: {
            ANTHROPIC_AUTH_TOKEN: 'api-key',
            ANTHROPIC_BASE_URL: 'https://api.example.com',
            ANTHROPIC_MODEL: 'sonnet',
        } });
        expect(db.machine.findFirst).toHaveBeenCalledWith({ where: { id: 'm1', accountId: 'u1' }, select: { id: true } });
        expect(db.session.findFirst).toHaveBeenCalledWith({ where: { id: 's1', accountId: 'u1' }, select: { id: true } });
        expect(db.managedCredential.update).toHaveBeenCalledWith({ where: { id: 'cred-1' }, data: { lastUsedAt: expect.any(Date) } });
        await app.close();
    });

    it('logs only credential metadata, never decrypted env-var values', async () => {
        db.managedCredential.findFirst.mockResolvedValue(credential());
        db.machine.findFirst.mockResolvedValue({ id: 'm1' });
        db.session.findFirst.mockResolvedValue({ id: 's1' });
        db.managedCredential.update.mockResolvedValue(credential());
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/credentials/cred-1/env-vars?machineId=m1&sessionId=s1', headers: { 'x-user-id': 'u1' } });

        expect(response.statusCode).toBe(200);
        expect(log).toHaveBeenCalledWith(expect.objectContaining({ envKeys: ['ANTHROPIC_AUTH_TOKEN', 'ANTHROPIC_BASE_URL'] }), 'Credential env vars issued');
        expect(JSON.stringify(log.mock.calls)).not.toContain('api-key');
        expect(JSON.stringify(log.mock.calls)).not.toContain('https://api.example.com');
        await app.close();
    });

    it('returns 404 when env-var context machine is not owned by user', async () => {
        db.managedCredential.findFirst.mockResolvedValue(credential());
        db.machine.findFirst.mockResolvedValue(null);
        const app = await createApp();

        const response = await app.inject({ method: 'GET', url: '/v1/credentials/cred-1/env-vars?machineId=missing', headers: { 'x-user-id': 'u1' } });

        expect(response.statusCode).toBe(404);
        expect(response.json()).toEqual({ error: 'Machine not found' });
        expect(decryptString).not.toHaveBeenCalled();
        await app.close();
    });

    it('returns an error when credential deletion fails instead of reporting success', async () => {
        db.managedCredential.deleteMany.mockRejectedValueOnce(new Error('database unavailable'));
        const app = await createApp();

        const response = await app.inject({
            method: 'DELETE',
            url: '/v1/credentials/cred-1',
            headers: { 'x-user-id': 'u1' },
        });

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ error: 'Failed to delete credential' });
        await app.close();
    });
});
