import { describe, expect, it, vi } from 'vitest';
import { applyAppStateChange } from './appStateLifecycle';

describe('applyAppStateChange', () => {
    it('stores the next state and drops callbacks when the account is inactive', () => {
        const events: string[] = [];

        expect(applyAppStateChange({
            nextAppState: 'background',
            setAppState: (state) => events.push(`state:${state}`),
            isAccountActive: () => false,
            onActive: () => events.push('active'),
            onBackground: () => events.push('background'),
        })).toBe(false);

        expect(events).toEqual(['state:background']);
    });

    it('runs active invalidation work only for an active transition', () => {
        const onActive = vi.fn();
        const onBackground = vi.fn();

        expect(applyAppStateChange({
            nextAppState: 'active',
            setAppState: vi.fn(),
            isAccountActive: () => true,
            onActive,
            onBackground,
        })).toBe(true);

        expect(onActive).toHaveBeenCalledTimes(1);
        expect(onBackground).not.toHaveBeenCalled();
    });

    it('runs background handling for every non-active state', () => {
        const onActive = vi.fn();
        const onBackground = vi.fn();

        expect(applyAppStateChange({
            nextAppState: 'inactive',
            setAppState: vi.fn(),
            isAccountActive: () => true,
            onActive,
            onBackground,
        })).toBe(true);

        expect(onActive).not.toHaveBeenCalled();
        expect(onBackground).toHaveBeenCalledWith('inactive');
    });
});
