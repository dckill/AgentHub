import { describe, expect, it, vi } from 'vitest';
import { runProjectHideLifecycle } from './projectHideLifecycle';

describe('project hide lifecycle', () => {
    it('stops before ignoring threads when the account changes during session archival', async () => {
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValue(false);
        const ignoreOfficialThreads = vi.fn();
        const applyHiddenCustomization = vi.fn();

        const applied = await runProjectHideLifecycle({
            hasActiveSessions: true,
            archiveActiveSessions: vi.fn(async () => undefined),
            ignoreOfficialThreads,
            isCurrent,
            applyHiddenCustomization,
        });

        expect(applied).toBe(false);
        expect(ignoreOfficialThreads).not.toHaveBeenCalled();
        expect(applyHiddenCustomization).not.toHaveBeenCalled();
    });

    it('does not apply stale customization after official thread operations finish', async () => {
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValueOnce(true)
            .mockReturnValue(false);
        const applyHiddenCustomization = vi.fn();

        const applied = await runProjectHideLifecycle({
            hasActiveSessions: false,
            archiveActiveSessions: vi.fn(),
            ignoreOfficialThreads: vi.fn(async () => undefined),
            isCurrent,
            applyHiddenCustomization,
        });

        expect(applied).toBe(false);
        expect(applyHiddenCustomization).not.toHaveBeenCalled();
    });

    it('applies the hidden customization only after the current lifecycle completes', async () => {
        const applyHiddenCustomization = vi.fn();

        const applied = await runProjectHideLifecycle({
            hasActiveSessions: true,
            archiveActiveSessions: vi.fn(async () => undefined),
            ignoreOfficialThreads: vi.fn(async () => undefined),
            isCurrent: () => true,
            applyHiddenCustomization,
        });

        expect(applied).toBe(true);
        expect(applyHiddenCustomization).toHaveBeenCalledTimes(1);
    });

    it('stops before official thread operations when session archival reports stale work', async () => {
        const ignoreOfficialThreads = vi.fn();
        const applyHiddenCustomization = vi.fn();

        const applied = await runProjectHideLifecycle({
            hasActiveSessions: true,
            archiveActiveSessions: vi.fn(async () => false),
            ignoreOfficialThreads,
            isCurrent: () => true,
            applyHiddenCustomization,
        });

        expect(applied).toBe(false);
        expect(ignoreOfficialThreads).not.toHaveBeenCalled();
        expect(applyHiddenCustomization).not.toHaveBeenCalled();
    });
});
