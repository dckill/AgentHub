import fastify from 'fastify';
import nacl from 'tweetnacl';
import * as privacyKit from 'privacy-kit';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const used = vi.hoisted(() => new Set<string>());
const { db } = vi.hoisted(() => ({ db: {
    authChallenge: { create: vi.fn(async ({ data }: any) => {
        if (used.has(data.digest)) throw Object.assign(new Error('unique'), { code: 'P2002' });
        used.add(data.digest);
        return data;
    }) },
    account: { upsert: vi.fn(async () => ({ id: 'account-1' })) },
    terminalAuthRequest: {}, accountAuthRequest: {},
} }));
const { auth } = vi.hoisted(() => ({ auth: { createToken: vi.fn(async () => 'issued-token') } }));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/app/auth/auth', () => ({ auth }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));

import { authRoutes } from './authRoutes';

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async () => undefined);
    authRoutes(typed);
    await typed.ready();
    return typed;
}

describe('signed authentication challenge', () => {
    beforeEach(() => { used.clear(); vi.clearAllMocks(); });

    it('accepts a valid challenge once and persistently rejects its replay', async () => {
        const app = await createApp();
        const keys = nacl.sign.keyPair();
        const challenge = new Uint8Array(32).fill(4);
        const payload = {
            publicKey: privacyKit.encodeBase64(Buffer.from(keys.publicKey)),
            challenge: privacyKit.encodeBase64(Buffer.from(challenge)),
            signature: privacyKit.encodeBase64(Buffer.from(nacl.sign.detached(challenge, keys.secretKey))),
        };

        const first = await app.inject({ method: 'POST', url: '/v1/auth', payload });
        const replay = await app.inject({ method: 'POST', url: '/v1/auth', payload });

        expect(first.statusCode).toBe(200);
        expect(replay.statusCode).toBe(409);
        expect(replay.json()).toEqual({ error: 'Challenge already used' });
        expect(auth.createToken).toHaveBeenCalledTimes(1);
        await app.close();
    });
});
