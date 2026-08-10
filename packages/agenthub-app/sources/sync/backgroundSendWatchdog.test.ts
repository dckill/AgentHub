import { describe, expect, it, vi } from 'vitest';
import { BackgroundSendWatchdog } from './backgroundSendWatchdog';

const createHarness = () => {
    let now = 1_000;
    const timers = new Map<number, () => void>();
    let nextTimer = 1;
    const scheduleNotification = vi.fn(async () => 'notification-1');
    const cancelNotification = vi.fn(async () => undefined);
    const notifyFailure = vi.fn(async () => undefined);
    const failPending = vi.fn();
    let hasPending = true;
    const watchdog = new BackgroundSendWatchdog({
        timeoutMs: 30_000,
        now: () => now,
        setTimeout: (callback) => {
            const id = nextTimer++;
            timers.set(id, callback);
            return id as unknown as ReturnType<typeof setTimeout>;
        },
        clearTimeout: (id) => timers.delete(id as unknown as number),
        scheduleNotification,
        cancelNotification,
        notifyFailure,
        failPending,
        hasPending: () => hasPending,
        log: vi.fn(),
    });

    return {
        watchdog,
        timers,
        advance: (value: number) => { now += value; },
        scheduleNotification,
        cancelNotification,
        notifyFailure,
        failPending,
        setPending: (value: boolean) => { hasPending = value; },
    };
};

describe('BackgroundSendWatchdog', () => {
    it('starts once only for pending work while the app is backgrounded', async () => {
        const harness = createHarness();

        harness.watchdog.maybeStart({ isWeb: false, isActive: false, hasPending: true });
        harness.watchdog.maybeStart({ isWeb: false, isActive: false, hasPending: true });

        expect(harness.timers.size).toBe(1);
        expect(harness.scheduleNotification).toHaveBeenCalledOnce();
    });

    it('does not start on web, while active, or with an empty queue', () => {
        const harness = createHarness();

        harness.watchdog.maybeStart({ isWeb: true, isActive: false, hasPending: true });
        harness.watchdog.maybeStart({ isWeb: false, isActive: true, hasPending: true });
        harness.watchdog.maybeStart({ isWeb: false, isActive: false, hasPending: false });

        expect(harness.timers.size).toBe(0);
        expect(harness.scheduleNotification).not.toHaveBeenCalled();
    });

    it('fails pending work after the timeout and clears the watchdog', async () => {
        const harness = createHarness();
        harness.watchdog.maybeStart({ isWeb: false, isActive: false, hasPending: true });
        const timer = [...harness.timers.values()][0];

        await Promise.resolve();
        harness.advance(30_000);
        harness.timers.clear();
        timer();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();

        expect(harness.cancelNotification).toHaveBeenCalledWith('notification-1');
        expect(harness.notifyFailure).toHaveBeenCalledOnce();
        expect(harness.failPending).toHaveBeenCalledWith('Message failed to send in background after 30s. Please retry.');
        expect(harness.timers.size).toBe(0);
    });

    it('fails overdue pending work when returning active, but not fresh work', async () => {
        const harness = createHarness();
        harness.watchdog.maybeStart({ isWeb: false, isActive: false, hasPending: true });
        await Promise.resolve();
        harness.advance(30_000);

        await harness.watchdog.handleAppActive(() => true);

        expect(harness.notifyFailure).toHaveBeenCalledOnce();
        expect(harness.failPending).toHaveBeenCalledOnce();
        expect(harness.timers.size).toBe(0);
    });

    it('clears fresh work on resume without marking it failed', async () => {
        const harness = createHarness();
        harness.watchdog.maybeStart({ isWeb: false, isActive: false, hasPending: true });
        await Promise.resolve();

        await harness.watchdog.handleAppActive(() => true);

        expect(harness.notifyFailure).not.toHaveBeenCalled();
        expect(harness.failPending).not.toHaveBeenCalled();
        expect(harness.cancelNotification).toHaveBeenCalledWith('notification-1');
        expect(harness.timers.size).toBe(0);
    });

    it('cancels a notification that resolves after the watchdog was stopped', async () => {
        let resolveSchedule!: (value: string) => void;
        const cancelNotification = vi.fn(async () => undefined);
        const watchdog = new BackgroundSendWatchdog({
            timeoutMs: 30_000,
            now: () => 1_000,
            setTimeout: (callback) => callback as unknown as ReturnType<typeof setTimeout>,
            clearTimeout: vi.fn(),
            scheduleNotification: () => new Promise<string>((resolve) => { resolveSchedule = resolve; }),
            cancelNotification,
            notifyFailure: vi.fn(async () => undefined),
            failPending: vi.fn(),
            hasPending: () => true,
            log: vi.fn(),
        });

        watchdog.maybeStart({ isWeb: false, isActive: false, hasPending: true });
        await watchdog.stop();
        resolveSchedule('late-notification');
        await Promise.resolve();
        await Promise.resolve();

        expect(cancelNotification).toHaveBeenCalledWith('late-notification');
    });

    it('does not fail replacement-account work when an in-flight timeout resolves after stop', async () => {
        let resolveFailure!: () => void;
        const notifyFailure = vi.fn(() => new Promise<void>((resolve) => {
            resolveFailure = resolve;
        }));
        const failPending = vi.fn();
        const timers = new Map<number, () => void>();
        let nextTimer = 1;
        const watchdog = new BackgroundSendWatchdog({
            timeoutMs: 30_000,
            now: () => 1_000,
            setTimeout: (callback) => {
                const id = nextTimer++;
                timers.set(id, callback);
                return id as unknown as ReturnType<typeof setTimeout>;
            },
            clearTimeout: (id) => timers.delete(id as unknown as number),
            scheduleNotification: vi.fn(async () => 'notification-1'),
            cancelNotification: vi.fn(async () => undefined),
            notifyFailure,
            failPending,
            hasPending: () => true,
            log: vi.fn(),
        });

        watchdog.maybeStart({ isWeb: false, isActive: false, hasPending: true });
        const timer = [...timers.values()][0];
        timer();
        await Promise.resolve();
        await Promise.resolve();
        await watchdog.stop();

        resolveFailure();
        await Promise.resolve();
        await Promise.resolve();

        expect(notifyFailure).toHaveBeenCalledOnce();
        expect(failPending).not.toHaveBeenCalled();
    });
});
