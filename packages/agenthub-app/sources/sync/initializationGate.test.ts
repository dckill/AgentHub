import { describe, expect, it, vi } from 'vitest';
import { RecoverableInitializationGate } from './initializationGate';

describe('RecoverableInitializationGate', () => {
    it('allows a clean retry after an initialization failure', async () => {
        const gate = new RecoverableInitializationGate();
        const rollback = vi.fn().mockResolvedValue(undefined);
        const firstError = new Error('restore failed');

        await expect(gate.run(vi.fn().mockRejectedValue(firstError), rollback)).rejects.toBe(firstError);
        await expect(gate.run(vi.fn().mockResolvedValue(undefined), rollback)).resolves.toBeUndefined();

        expect(rollback).toHaveBeenCalledOnce();
        expect(gate.state).toBe('ready');
    });

    it('shares one pending initialization across concurrent callers', async () => {
        const gate = new RecoverableInitializationGate();
        let finish!: () => void;
        const operation = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));

        const first = gate.run(operation, vi.fn());
        const second = gate.run(operation, vi.fn());
        finish();

        await expect(Promise.all([first, second])).resolves.toEqual([undefined, undefined]);
        expect(operation).toHaveBeenCalledOnce();
        expect(gate.state).toBe('ready');
    });

    it('reset waits for a pending attempt, performs final cleanup, and permits another run', async () => {
        const gate = new RecoverableInitializationGate();
        let fail!: (error: Error) => void;
        const pending = gate.run(
            () => new Promise<void>((_resolve, reject) => { fail = reject; }),
            vi.fn().mockResolvedValue(undefined),
        );
        const cleanup = vi.fn().mockResolvedValue(undefined);
        const reset = gate.reset(cleanup);
        fail(new Error('cancelled'));

        await expect(pending).rejects.toThrow('cancelled');
        await expect(reset).resolves.toBeUndefined();
        expect(cleanup).toHaveBeenCalledTimes(2);
        expect(gate.state).toBe('idle');
        await expect(gate.run(vi.fn().mockResolvedValue(undefined), cleanup)).resolves.toBeUndefined();
    });
});
