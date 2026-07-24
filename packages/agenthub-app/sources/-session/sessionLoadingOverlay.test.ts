import { describe, expect, it } from 'vitest';
import { shouldShowSessionLoadingOverlay } from './sessionLoadingOverlay';

describe('shouldShowSessionLoadingOverlay', () => {
    it('shows the outer loading overlay while app data is not ready', () => {
        expect(shouldShowSessionLoadingOverlay({
            isDataReady: false,
            isEnsuringSession: false,
            hasSession: false,
        })).toBe(true);
    });

    it('shows the outer loading overlay while a missing session is being fetched', () => {
        expect(shouldShowSessionLoadingOverlay({
            isDataReady: true,
            isEnsuringSession: true,
            hasSession: false,
        })).toBe(true);
    });

    it('keeps loaded session content visible while message loading handles its own pending state', () => {
        expect(shouldShowSessionLoadingOverlay({
            isDataReady: true,
            isEnsuringSession: true,
            hasSession: true,
        })).toBe(false);
    });
});
