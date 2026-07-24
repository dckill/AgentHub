import fastify from 'fastify';
import { serializerCompiler, validatorCompiler, ZodTypeProvider } from 'fastify-type-provider-zod';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Fastify } from '../types';

const { db, emitUpdate, allocateUserSeq, allocateUserSeqBatch } = vi.hoisted(() => {
    const db: any = {
        machine: {
            findFirst: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
        },
        $transaction: vi.fn(),
    };
    return {
        db,
        emitUpdate: vi.fn(),
        allocateUserSeq: vi.fn(async () => 1),
        allocateUserSeqBatch: vi.fn(async () => [1, 2]),
    };
});

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/storage/seq', () => ({ allocateUserSeq, allocateUserSeqBatch }));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));
vi.mock('@/utils/randomKeyNaked', () => ({ randomKeyNaked: vi.fn(() => 'update-id') }));
vi.mock('@/app/events/eventRouter', () => ({
    eventRouter: { emitUpdate },
    buildNewMachineUpdate: vi.fn(() => ({})),
    buildUpdateMachineUpdate: vi.fn(() => ({})),
    buildDeleteMachineUpdate: vi.fn(() => ({})),
}));

import { machinesRoutes } from './machinesRoutes';

async function createApp() {
    const app = fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    const typed = app.withTypeProvider<ZodTypeProvider>() as unknown as Fastify;
    typed.decorate('authenticate', async (request: any) => { request.userId = 'user-1'; });
    machinesRoutes(typed);
    await typed.ready();
    return typed;
}

describe('machinesRoutes account quota', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.machine.findFirst.mockResolvedValue(null);
        db.machine.count.mockResolvedValue(1_000);
        db.machine.create.mockResolvedValue({
            id: 'machine-1', metadata: 'metadata', metadataVersion: 1,
            daemonState: null, daemonStateVersion: 0, dataEncryptionKey: null,
            active: false, lastActiveAt: new Date(1), createdAt: new Date(1), updatedAt: new Date(1),
        });
        db.$transaction.mockImplementation(async (callback: any) => callback(db));
    });

    it('returns 429 before sequence allocation and creation when the machine quota is full', async () => {
        const app = await createApp();
        const response = await app.inject({
            method: 'POST',
            url: '/v1/machines',
            payload: { id: 'machine-1', metadata: 'metadata' },
        });

        expect(response.statusCode).toBe(429);
        expect(response.json()).toEqual({ error: 'quota-exceeded', resource: 'machines', limit: 1_000 });
        expect(db.machine.create).not.toHaveBeenCalled();
        expect(allocateUserSeq).not.toHaveBeenCalled();
        expect(emitUpdate).not.toHaveBeenCalled();
        await app.close();
    });
});
