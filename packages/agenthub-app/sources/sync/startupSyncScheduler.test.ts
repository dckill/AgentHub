import { describe, expect, it, vi } from 'vitest';
import { runStartupSyncs } from './startupSyncScheduler';

describe('runStartupSyncs', () => {
    it('runs critical syncs immediately and staggers background syncs', () => {
        const calls: string[] = [];
        const scheduled: Array<{ delayMs: number, run: () => void }> = [];

        runStartupSyncs({
            immediate: [
                { name: 'sessions', run: () => calls.push('sessions') },
            ],
            background: [
                { name: 'settings', run: () => calls.push('settings') },
                { name: 'profile', run: () => calls.push('profile') },
                { name: 'machines', run: () => calls.push('machines') },
            ],
            backgroundInitialDelayMs: 750,
            backgroundStaggerMs: 250,
            schedule: (run, delayMs) => {
                scheduled.push({ delayMs, run });
                return 1;
            },
            onBackgroundTaskError: vi.fn(),
        });

        expect(calls).toEqual(['sessions']);
        expect(scheduled.map(item => item.delayMs)).toEqual([750, 1000, 1250]);

        scheduled[0].run();
        scheduled[1].run();
        scheduled[2].run();

        expect(calls).toEqual(['sessions', 'settings', 'profile', 'machines']);
    });

    it('isolates background task errors so later startup tasks still run', () => {
        const calls: string[] = [];
        const scheduled: Array<() => void> = [];
        const onBackgroundTaskError = vi.fn();

        runStartupSyncs({
            immediate: [],
            background: [
                { name: 'settings', run: () => { throw new Error('settings failed'); } },
                { name: 'profile', run: () => calls.push('profile') },
            ],
            schedule: (run) => {
                scheduled.push(run);
                return 1;
            },
            onBackgroundTaskError,
        });

        scheduled.forEach(run => run());

        expect(calls).toEqual(['profile']);
        expect(onBackgroundTaskError).toHaveBeenCalledTimes(1);
        expect(onBackgroundTaskError).toHaveBeenCalledWith('settings', expect.any(Error));
    });

    it('cancels deferred account syncs before they can run', () => {
        const calls: string[] = [];
        const scheduled: Array<() => void> = [];
        const cancelScheduled = vi.fn();

        const cancel = runStartupSyncs({
            immediate: [],
            background: [{ name: 'account-a-settings', run: () => calls.push('account-a-settings') }],
            schedule: (run) => {
                scheduled.push(run);
                return 'timer-a';
            },
            cancelScheduled,
        });

        cancel();
        cancel();
        scheduled.forEach(run => run());

        expect(calls).toEqual([]);
        expect(cancelScheduled).toHaveBeenCalledTimes(1);
        expect(cancelScheduled).toHaveBeenCalledWith('timer-a');
    });
});
