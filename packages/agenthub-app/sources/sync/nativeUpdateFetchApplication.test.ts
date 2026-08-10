import { describe, expect, it, vi } from 'vitest';
import { runNativeUpdateFetchApplication } from './nativeUpdateFetchApplication';

describe('runNativeUpdateFetchApplication', () => {
    it('applies a valid update only after the request generation remains current', async () => {
        const status = { available: true, updateUrl: 'https://example.com/app.apk' };
        const applyStatus = vi.fn();

        await expect(runNativeUpdateFetchApplication({
            runRequest: async (operation) => operation({ signal: new AbortController().signal }),
            fetchUpdate: async () => status,
            assertCurrent: vi.fn(),
            isCurrent: () => true,
            applyStatus,
            reportError: vi.fn(),
        })).resolves.toBeUndefined();

        expect(applyStatus).toHaveBeenCalledWith(status);
    });

    it('clears the status and reports only current-account failures', async () => {
        const reportError = vi.fn();
        const applyStatus = vi.fn();

        await runNativeUpdateFetchApplication({
            runRequest: async (operation) => operation({ signal: new AbortController().signal }),
            fetchUpdate: async () => { throw new Error('offline'); },
            assertCurrent: vi.fn(),
            isCurrent: () => true,
            applyStatus,
            reportError,
        });

        expect(reportError).toHaveBeenCalledOnce();
        expect(applyStatus).toHaveBeenCalledWith(null);
    });
});
