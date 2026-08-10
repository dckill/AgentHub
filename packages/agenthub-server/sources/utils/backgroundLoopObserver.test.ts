import { describe, expect, it, vi } from 'vitest';
import { createBackgroundLoopObserver } from './backgroundLoopObserver';

describe('createBackgroundLoopObserver', () => {
    it('counts failures and exposes the consecutive failure gauge', () => {
        const failures = { inc: vi.fn() };
        const consecutive = { set: vi.fn() };
        const observer = createBackgroundLoopObserver({ failures, consecutive });

        observer.onFailure('session-timeout', new Error('db down'), 1);
        observer.onFailure('session-timeout', new Error('db down'), 2);

        expect(failures.inc).toHaveBeenNthCalledWith(1, { loop: 'session-timeout' });
        expect(failures.inc).toHaveBeenNthCalledWith(2, { loop: 'session-timeout' });
        expect(consecutive.set).toHaveBeenNthCalledWith(1, { loop: 'session-timeout' }, 1);
        expect(consecutive.set).toHaveBeenNthCalledWith(2, { loop: 'session-timeout' }, 2);
    });

    it('resets the consecutive gauge after the loop recovers', () => {
        const consecutive = { set: vi.fn() };
        const observer = createBackgroundLoopObserver({
            failures: { inc: vi.fn() },
            consecutive,
        });

        observer.onFailure('database-metrics-updater', new Error('temporary'), 3);
        observer.onSuccess('database-metrics-updater');

        expect(consecutive.set).toHaveBeenLastCalledWith({ loop: 'database-metrics-updater' }, 0);
    });
});
