import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    forever: vi.fn(),
    delay: vi.fn(),
    sessionFindMany: vi.fn(),
    sessionUpdateManyAndReturn: vi.fn(),
    machineFindMany: vi.fn(),
    machineUpdateManyAndReturn: vi.fn(),
    externalShareUpdateMany: vi.fn(),
    activityCache: { clearSessionUpdates: vi.fn() },
}));

vi.mock('@/utils/forever', () => ({ forever: mocks.forever }));
vi.mock('@/utils/delay', () => ({ delay: mocks.delay }));
vi.mock('@/utils/shutdown', () => ({ shutdownSignal: new AbortController().signal }));
vi.mock('@/storage/db', () => ({
    db: {
        session: {
            findMany: mocks.sessionFindMany,
            updateManyAndReturn: mocks.sessionUpdateManyAndReturn,
        },
        machine: {
            findMany: mocks.machineFindMany,
            updateManyAndReturn: mocks.machineUpdateManyAndReturn,
        },
        externalShare: {
            updateMany: mocks.externalShareUpdateMany,
        },
    },
}));
vi.mock('@/app/events/eventRouter', () => ({
    eventRouter: { emitEphemeral: vi.fn() },
    buildSessionActivityEphemeral: vi.fn(),
    buildMachineActivityEphemeral: vi.fn(),
}));
vi.mock('@/app/presence/sessionCache', () => ({ activityCache: mocks.activityCache }));

import { startTimeout } from './timeout';

describe('presence timeout lifecycle', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.sessionFindMany.mockResolvedValueOnce([]).mockRejectedValueOnce(
            new Error('timeout callback started a second sweep'),
        );
        mocks.machineFindMany.mockResolvedValue([]);
        mocks.externalShareUpdateMany.mockResolvedValue({ count: 0 });
        mocks.delay.mockResolvedValue(undefined);
    });

    it('performs one sweep per forever callback so shutdown can regain control', async () => {
        let sweep: (() => Promise<void>) | undefined;
        mocks.forever.mockImplementation((_name: string, callback: () => Promise<void>) => {
            sweep = callback;
        });

        startTimeout();
        expect(sweep).toBeTypeOf('function');
        await expect(sweep!()).resolves.toBeUndefined();

        expect(mocks.sessionFindMany).toHaveBeenCalledOnce();
        expect(mocks.machineFindMany).toHaveBeenCalledOnce();
        expect(mocks.externalShareUpdateMany).toHaveBeenCalledOnce();
        expect(mocks.delay).toHaveBeenCalledOnce();
    });

    it('suppresses cached session heartbeats before timeout deactivation', async () => {
        let sweep: (() => Promise<void>) | undefined;
        mocks.forever.mockImplementation((_name: string, callback: () => Promise<void>) => {
            sweep = callback;
        });
        mocks.sessionFindMany.mockReset();
        mocks.sessionFindMany.mockResolvedValueOnce([{
            id: 's1',
            accountId: 'u1',
            active: true,
            lastActiveAt: new Date(1),
        }]);
        mocks.sessionUpdateManyAndReturn.mockResolvedValueOnce([{
            id: 's1',
            lastActiveAt: new Date(2),
        }]);

        startTimeout();
        await sweep!();

        expect(mocks.activityCache.clearSessionUpdates).toHaveBeenCalledWith('s1');
        expect(mocks.sessionUpdateManyAndReturn).toHaveBeenCalledWith(expect.objectContaining({
            where: { id: 's1', active: true },
        }));
    });
});
