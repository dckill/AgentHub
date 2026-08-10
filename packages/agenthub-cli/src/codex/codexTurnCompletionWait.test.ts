import { describe, expect, it, vi } from 'vitest';
import { waitForCodexTurnCompletion } from './codexTurnCompletionWait';

describe('waitForCodexTurnCompletion', () => {
    it('returns immediately when no turn is pending', async () => {
        const sleep = vi.fn(async () => undefined);

        await expect(waitForCodexTurnCompletion({
            hasPending: () => false,
            timeoutMs: 100,
            now: () => 0,
            sleep,
        })).resolves.toBe(true);

        expect(sleep).not.toHaveBeenCalled();
    });

    it('waits until the pending turn resolves', async () => {
        let checks = 0;
        const sleep = vi.fn(async () => undefined);

        await expect(waitForCodexTurnCompletion({
            hasPending: () => checks++ < 2,
            timeoutMs: 100,
            now: () => 0,
            sleep,
        })).resolves.toBe(true);

        expect(sleep).toHaveBeenCalledTimes(1);
        expect(sleep).toHaveBeenCalledWith(25);
    });

    it('returns false when the grace period expires', async () => {
        let now = 0;
        const sleep = vi.fn(async () => { now = 101; });

        await expect(waitForCodexTurnCompletion({
            hasPending: () => true,
            timeoutMs: 100,
            now: () => now,
            sleep,
        })).resolves.toBe(false);

        expect(sleep).toHaveBeenCalledOnce();
    });
});
