import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, eventRouter, buildUsageEphemeral } = vi.hoisted(() => ({
    db: {
        session: { findFirst: vi.fn() },
        usageReport: { upsert: vi.fn() },
    },
    eventRouter: { emitEphemeral: vi.fn() },
    buildUsageEphemeral: vi.fn(() => ({ type: 'usage' })),
}));

vi.mock('@/storage/db', () => ({ db }));
vi.mock('@/utils/lock', () => ({
    AsyncLock: class {
        async inLock(fn: () => Promise<void>) {
            await fn();
        }
    },
}));
vi.mock('@/utils/log', () => ({ log: vi.fn() }));
vi.mock('@/app/events/eventRouter', () => ({ eventRouter, buildUsageEphemeral }));

import { usageHandler } from './usageHandler';

function registerHandler() {
    const handlers: Record<string, Function> = {};
    const socket = {
        on: vi.fn((event: string, handler: Function) => {
            handlers[event] = handler;
        }),
    };
    usageHandler('account-1', socket as any);
    return handlers['usage-report'];
}

const report = {
    key: 'claude-session-daily',
    tokens: { total: 120, input: 80, output: 40 },
    cost: { total: 0.04 },
    model: 'claude-sonnet-4',
};

describe('usageHandler scope identity', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        db.usageReport.upsert.mockResolvedValue({
            id: 'usage-1',
            createdAt: new Date('2026-07-16T00:00:00.000Z'),
            updatedAt: new Date('2026-07-16T00:00:00.000Z'),
        });
    });

    it('idempotently stores account-level reports without a nullable compound key', async () => {
        const callback = vi.fn();

        await registerHandler()(report, callback);

        expect(db.usageReport.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                accountId_scopeKey_key: {
                    accountId: 'account-1',
                    scopeKey: 'account',
                    key: report.key,
                },
            },
            create: expect.objectContaining({
                accountId: 'account-1',
                sessionId: null,
                scopeKey: 'account',
                key: report.key,
            }),
        }));
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('keeps reports from different sessions in distinct idempotency scopes', async () => {
        db.session.findFirst.mockResolvedValue({ id: 'session-1' });
        const callback = vi.fn();

        await registerHandler()({ ...report, sessionId: 'session-1' }, callback);

        expect(db.usageReport.upsert).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                accountId_scopeKey_key: {
                    accountId: 'account-1',
                    scopeKey: 'session:session-1',
                    key: report.key,
                },
            },
            create: expect.objectContaining({
                sessionId: 'session-1',
                scopeKey: 'session:session-1',
            }),
        }));
        expect(buildUsageEphemeral).toHaveBeenCalledWith(
            'session-1',
            report.key,
            report.tokens,
            report.cost,
        );
        expect(callback).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
});
