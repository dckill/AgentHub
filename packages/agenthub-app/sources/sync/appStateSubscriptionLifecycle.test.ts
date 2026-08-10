import { describe, expect, it, vi } from 'vitest';
import { subscribeAppStateListener } from './appStateSubscriptionLifecycle';

describe('app state subscription lifecycle', () => {
    it('removes the native listener exactly once', () => {
        const remove = vi.fn();
        const listener = vi.fn();
        const addEventListener = vi.fn(() => ({ remove }));

        const cleanup = subscribeAppStateListener(addEventListener, listener);

        expect(addEventListener).toHaveBeenCalledWith('change', listener);
        cleanup();
        cleanup();

        expect(remove).toHaveBeenCalledTimes(1);
    });

    it('does not remove a listener before cleanup is requested', () => {
        const remove = vi.fn();
        const addEventListener = vi.fn(() => ({ remove }));

        subscribeAppStateListener(addEventListener, vi.fn());

        expect(remove).not.toHaveBeenCalled();
    });
});
