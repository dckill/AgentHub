import { describe, expect, it } from 'vitest';
import { getAndroidBackExitDecision } from './androidBackExit';

describe('getAndroidBackExitDecision', () => {
    it('prompts on first back press', () => {
        expect(getAndroidBackExitDecision(1000, null)).toEqual({
            shouldExit: false,
            nextBackPressAtMs: 1000,
        });
    });

    it('exits when the second back press is within the timeout window', () => {
        expect(getAndroidBackExitDecision(2500, 1000, 2000)).toEqual({
            shouldExit: true,
            nextBackPressAtMs: null,
        });
    });

    it('prompts again when the second back press is outside the timeout window', () => {
        expect(getAndroidBackExitDecision(3101, 1000, 2000)).toEqual({
            shouldExit: false,
            nextBackPressAtMs: 3101,
        });
    });

    it('resets the window if the clock moves backwards', () => {
        expect(getAndroidBackExitDecision(900, 1000, 2000)).toEqual({
            shouldExit: false,
            nextBackPressAtMs: 900,
        });
    });
});
