import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { state, db, emitUpdate, reset } = vi.hoisted(() => {
    const state = {
        artifact: null as any,
        userSeq: 0,
        updateReads: 0,
        readGate: Promise.resolve() as Promise<void>,
        releaseReads: (() => undefined) as () => void,
        barrierReads: false,
    };
    const reset = () => {
        state.artifact = {
            id: 'artifact-1',
            accountId: 'user-1',
            header: Buffer.from('old-header'),
            headerVersion: 1,
            body: Buffer.from('old-body'),
            bodyVersion: 1,
            seq: 0,
        };
        state.userSeq = 0;
        state.updateReads = 0;
        state.readGate = new Promise<void>((resolve) => { state.releaseReads = resolve; });
        state.barrierReads = false;
    };
    const matches = (where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => state.artifact?.[key] === value);
    const apply = (data: Record<string, any>) => {
        for (const [key, value] of Object.entries(data)) {
            state.artifact[key] = value && typeof value === 'object' && 'increment' in value
                ? state.artifact[key] + value.increment
                : value;
        }
    };
    const db = {
        artifact: {
            count: vi.fn(),
            findUnique: vi.fn(async ({ where }: any) => state.artifact?.id === where.id ? { ...state.artifact } : null),
            create: vi.fn(async ({ data }: any) => ({
                ...data,
                headerVersion: 1,
                bodyVersion: 1,
                seq: 0,
                createdAt: new Date(1),
                updatedAt: new Date(1),
            })),
            findFirst: vi.fn(async ({ where }: any) => {
                const snapshot = matches(where) ? { ...state.artifact } : null;
                state.updateReads += 1;
                if (state.barrierReads && state.updateReads === 2) state.releaseReads();
                if (state.barrierReads && state.updateReads <= 2) await state.readGate;
                return snapshot;
            }),
            update: vi.fn(async ({ data }: any) => {
                apply(data);
                return { ...state.artifact };
            }),
            updateMany: vi.fn(async ({ where, data }: any) => {
                if (!matches(where)) return { count: 0 };
                apply(data);
                return { count: 1 };
            }),
        },
        $transaction: vi.fn(),
    };
    return { state, db, emitUpdate: vi.fn(), reset };
});

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/storage/seq', () => ({ allocateUserSeq: vi.fn(async () => ++state.userSeq) }));
vi.mock('@/app/events/eventRouter', () => ({
    eventRouter: { emitUpdate },
    buildNewArtifactUpdate: vi.fn(),
    buildUpdateArtifactUpdate: vi.fn(() => ({ t: 'update-artifact' })),
    buildDeleteArtifactUpdate: vi.fn(),
}));
vi.mock('@/utils/randomKeyNaked', () => ({ randomKeyNaked: vi.fn(() => 'random-key') }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));

import { artifactsRoutes } from './artifactsRoutes';

async function createApp() {
    const app = fastify({ bodyLimit: 8 * 1024 * 1024 });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any) => { request.userId = 'user-1'; });
    artifactsRoutes(typed);
    await typed.ready();
    return typed;
}

describe('artifactsRoutes CAS updates', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        reset();
        db.artifact.count.mockResolvedValue(0);
        db.$transaction.mockImplementation(async (callback: any) => callback(db));
    });

    it('allows only one of two concurrent writes with the same expected version', async () => {
        state.barrierReads = true;
        const app = await createApp();
        const request = (header: string) => app.inject({
            method: 'POST',
            url: '/v1/artifacts/artifact-1',
            payload: {
                header: Buffer.from(header).toString('base64'),
                expectedHeaderVersion: 1,
            },
        });

        const responses = await Promise.all([request('header-a'), request('header-b')]);
        const bodies = responses.map((response) => response.json());

        expect(bodies.filter((body) => body.success === true)).toHaveLength(1);
        expect(bodies.filter((body) => body.error === 'version-mismatch')).toHaveLength(1);
        expect(state.artifact.headerVersion).toBe(2);
        expect(state.artifact.seq).toBe(1);
        expect(emitUpdate).toHaveBeenCalledTimes(1);
        await app.close();
    });

    it('rejects oversized encrypted artifact headers before database access', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/artifacts/artifact-1',
            payload: { header: 'h'.repeat(1024 * 1024 + 1), expectedHeaderVersion: 1 },
        });

        expect(response.statusCode).toBe(400);
        expect(db.artifact.findFirst).not.toHaveBeenCalled();
        await app.close();
    });

    it('returns 429 without creating or emitting when the artifact quota is full', async () => {
        db.artifact.count.mockResolvedValue(1_000);
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/artifacts',
            payload: {
                id: '00000000-0000-4000-8000-000000000001',
                header: Buffer.from('header').toString('base64'),
                body: Buffer.from('body').toString('base64'),
                dataEncryptionKey: Buffer.from('key').toString('base64'),
            },
        });

        expect(response.statusCode).toBe(429);
        expect(response.json()).toEqual({ error: 'quota-exceeded', resource: 'artifacts', limit: 1_000 });
        expect(db.artifact.create).not.toHaveBeenCalled();
        expect(emitUpdate).not.toHaveBeenCalled();
        await app.close();
    });
});
