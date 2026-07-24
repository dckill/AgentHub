import { describe, expect, it, vi } from 'vitest';
import { AccountLifecycle } from './accountLifecycle';

describe('AccountLifecycle', () => {
    it('invalidates account A work before account B begins', () => {
        const lifecycle = new AccountLifecycle();
        const accountA = lifecycle.begin();
        const applyA = vi.fn();

        lifecycle.end();
        const accountB = lifecycle.begin();

        lifecycle.runIfCurrent(accountA, applyA);

        expect(applyA).not.toHaveBeenCalled();
        expect(lifecycle.isCurrent(accountA)).toBe(false);
        expect(lifecycle.isCurrent(accountB)).toBe(true);
    });

    it('ends idempotently and never revalidates an old generation', () => {
        const lifecycle = new AccountLifecycle();
        const accountA = lifecycle.begin();

        lifecycle.end();
        lifecycle.end();

        expect(lifecycle.isCurrent(accountA)).toBe(false);
        expect(lifecycle.isActive()).toBe(false);
    });

    it('aborts every account A request without aborting account B requests', () => {
        const lifecycle = new AccountLifecycle();
        const accountA = lifecycle.begin();
        const requestA1 = lifecycle.createRequest(accountA);
        const requestA2 = lifecycle.createRequest(accountA);

        lifecycle.end();
        const accountB = lifecycle.begin();
        const requestB = lifecycle.createRequest(accountB);

        expect(requestA1.signal.aborted).toBe(true);
        expect(requestA2.signal.aborted).toBe(true);
        expect(requestB.signal.aborted).toBe(false);
        requestB.release();
    });

    it('rejects stale work before it can commit account A data', () => {
        const lifecycle = new AccountLifecycle();
        const accountA = lifecycle.begin();
        lifecycle.end();
        lifecycle.begin();

        expect(() => lifecycle.assertCurrent(accountA)).toThrow('Account lifecycle is stale');
    });

    it('rejects a response that resolves after switching accounts', async () => {
        const lifecycle = new AccountLifecycle();
        const accountA = lifecycle.begin();
        let resolveResponse!: (value: string) => void;
        const response = new Promise<string>(resolve => { resolveResponse = resolve; });
        const operation = lifecycle.runRequest(accountA, async () => response);

        lifecycle.end();
        lifecycle.begin();
        resolveResponse('account-a-data');

        await expect(operation).rejects.toMatchObject({ name: 'AbortError' });
    });

    it('keeps same-named resource locks distinct across accounts', () => {
        const lifecycle = new AccountLifecycle();
        const accountA = lifecycle.begin();
        const keyA = lifecycle.scopedKey(accountA, 'same-session');
        lifecycle.end();
        const accountB = lifecycle.begin();

        expect(lifecycle.scopedKey(accountB, 'same-session')).not.toBe(keyA);
    });
});
