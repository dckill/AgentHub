import { describe, expect, it, vi } from 'vitest';
import { getArchiveFeedbackNavigationDelayMs, navigateAfterSessionArchive, navigateAfterSessionDelete } from './sessionInfoArchiveNavigation';

describe('getArchiveFeedbackNavigationDelayMs', () => {
    it.each(['timeout', 'not-found'])('keeps abnormal daemon terminal state %s visible long enough to perceive', (state) => {
        expect(getArchiveFeedbackNavigationDelayMs(state)).toBe(1_500);
    });

    it('keeps the successful runner exit visible long enough for the live region to announce it', () => {
        expect(getArchiveFeedbackNavigationDelayMs('exited')).toBe(1_000);
    });

    it.each(['stopping', 'archived'])('does not delay unobserved or server-only state %s', (state) => {
        expect(getArchiveFeedbackNavigationDelayMs(state)).toBe(50);
    });
});

describe('navigateAfterSessionArchive', () => {
    it('returns to the session list without popping the Android root screen', async () => {
        const router = {
            back: vi.fn(),
            replace: vi.fn(),
        };

        navigateAfterSessionArchive(router, 10);

        // Wait for the setTimeout delay
        await new Promise(resolve => setTimeout(resolve, 20));

        expect(router.replace).toHaveBeenCalledWith('/');
        expect(router.back).not.toHaveBeenCalled();
    });

    it('uses default delay when not specified', async () => {
        const router = {
            back: vi.fn(),
            replace: vi.fn(),
        };
        const originalSetTimeout = global.setTimeout;
        const mockSetTimeout = vi.fn((callback: () => void) => originalSetTimeout(callback, 50));

        // Temporarily replace setTimeout to capture the call
        vi.spyOn(global, 'setTimeout').mockImplementation(mockSetTimeout);

        navigateAfterSessionArchive(router);

        // Wait for the default delay
        await new Promise(resolve => setTimeout(resolve, 60));

        expect(router.replace).toHaveBeenCalledWith('/');
        expect(router.back).not.toHaveBeenCalled();

        vi.spyOn(global, 'setTimeout').mockRestore();
    });
});

describe('navigateAfterSessionDelete', () => {
    it('dismisses the session stack before deleting local session state', async () => {
        vi.useFakeTimers();

        const router = {
            canDismiss: vi.fn(() => true),
            dismissAll: vi.fn(),
            replace: vi.fn(),
        };
        const deleteLocalSession = vi.fn();

        navigateAfterSessionDelete(router, deleteLocalSession, 50);

        expect(router.dismissAll).not.toHaveBeenCalled();
        expect(router.replace).not.toHaveBeenCalled();
        expect(deleteLocalSession).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(50);

        expect(router.canDismiss).toHaveBeenCalledTimes(1);
        expect(router.dismissAll).toHaveBeenCalledTimes(1);
        expect(router.replace).toHaveBeenCalledWith('/');
        expect(deleteLocalSession).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(50);

        expect(deleteLocalSession).toHaveBeenCalledTimes(1);

        vi.useRealTimers();
    });
});
