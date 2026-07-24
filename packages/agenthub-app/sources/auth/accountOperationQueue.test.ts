import { describe, expect, it } from 'vitest';
import { createAccountOperationQueue } from './accountOperationQueue';

describe('account operation queue', () => {
    it('serializes slow account mutations in submission order', async () => {
        const queue = createAccountOperationQueue();
        const calls: string[] = [];
        let releaseFirst!: () => void;
        const first = queue.run(async () => {
            calls.push('a:start');
            await new Promise<void>(resolve => { releaseFirst = resolve; });
            calls.push('a:end');
            return 'a';
        });
        const second = queue.run(async () => {
            calls.push('b:start');
            return 'b';
        });

        await Promise.resolve();
        expect(calls).toEqual(['a:start']);
        releaseFirst();
        await expect(first).resolves.toBe('a');
        await expect(second).resolves.toBe('b');
        expect(calls).toEqual(['a:start', 'a:end', 'b:start']);
    });

    it('continues with the next account mutation after a failure', async () => {
        const queue = createAccountOperationQueue();
        const calls: string[] = [];
        const first = queue.run(async () => {
            calls.push('failed');
            throw new Error('account A failed');
        });
        const second = queue.run(async () => {
            calls.push('recovered');
            return 'ok';
        });

        await expect(first).rejects.toThrow('account A failed');
        await expect(second).resolves.toBe('ok');
        expect(calls).toEqual(['failed', 'recovered']);
    });
});
