import { beforeEach, describe, expect, it, vi } from 'vitest';

const { transaction } = vi.hoisted(() => ({
    transaction: vi.fn(),
}));

vi.mock('@/storage/db', () => ({
    db: { $transaction: transaction },
}));

import { afterTx, inTx } from './inTx';

describe('inTx post-commit callbacks', () => {
    beforeEach(() => {
        transaction.mockReset();
        transaction.mockImplementation(async (callback) => callback({}));
    });

    it('waits for asynchronous callbacks before resolving', async () => {
        const calls: string[] = [];
        let release!: () => void;
        const callbackGate = new Promise<void>((resolve) => { release = resolve; });

        let settled = false;
        const operation = inTx(async (tx) => {
            afterTx(tx, async () => {
                await callbackGate;
                calls.push('after-commit');
            });
            calls.push('transaction');
            return 'done';
        });
        void operation.finally(() => { settled = true; });

        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(settled).toBe(false);
        release();

        const result = await operation;
        expect(result).toBe('done');
        expect(calls).toEqual(['transaction', 'after-commit']);
    });

    it('captures asynchronous callback rejection without rejecting the committed transaction', async () => {
        const error = new Error('notification failed');
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

        await expect(inTx(async (tx) => {
            afterTx(tx, async () => {
                await Promise.resolve();
                throw error;
            });
            return 'committed';
        })).resolves.toBe('committed');

        expect(consoleError).toHaveBeenCalledWith(error);
        consoleError.mockRestore();
    });
});
