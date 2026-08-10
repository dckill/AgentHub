import { describe, expect, it, vi } from 'vitest';
import { runNativeUpdateSync, type NativeUpdateSyncOptions } from './nativeUpdateSyncLifecycle';

const base = (): NativeUpdateSyncOptions => ({
    generation: 2,
    platform: 'android',
    version: '1.2.3',
    appId: 'com.example.agenthub',
    runRequest: vi.fn(async <T>(_generation: number, operation: (request: { signal: AbortSignal; assertCurrent: () => void }) => Promise<T>) => operation({ signal: new AbortController().signal, assertCurrent: vi.fn() })) as unknown as NativeUpdateSyncOptions['runRequest'],
    fetchUpdate: vi.fn(async () => ({ available: true as const, updateUrl: 'https://example.com/update' })),
    assertCurrent: vi.fn(),
    isCurrent: () => true,
    applyStatus: vi.fn(),
    reportError: vi.fn(),
});

describe('native update sync lifecycle', () => {
    it('skips unsupported platforms or incomplete app identity before requesting', async () => {
        const unsupported = base();
        unsupported.platform = 'web';
        await runNativeUpdateSync(unsupported);
        expect(unsupported.runRequest).not.toHaveBeenCalled();

        const incomplete = base();
        incomplete.appId = undefined;
        await runNativeUpdateSync(incomplete);
        expect(incomplete.runRequest).not.toHaveBeenCalled();
    });

    it('binds supported update checks to the account generation and applies the status', async () => {
        const options = base();
        const runRequest = vi.fn(options.runRequest);
        options.runRequest = runRequest as unknown as NativeUpdateSyncOptions['runRequest'];

        await runNativeUpdateSync(options);

        expect(runRequest).toHaveBeenCalledWith(2, expect.any(Function));
        expect(options.fetchUpdate).toHaveBeenCalledWith(expect.objectContaining({ signal: expect.any(AbortSignal) }));
        expect(options.applyStatus).toHaveBeenCalledWith({ available: true, updateUrl: 'https://example.com/update' });
    });

    it('fails soft when setup throws for the current account', async () => {
        const options = base();
        options.runRequest = async () => { throw new Error('setup failed'); };

        await expect(runNativeUpdateSync(options)).resolves.toBeUndefined();
        expect(options.reportError).toHaveBeenCalledWith(expect.any(Error));
        expect(options.applyStatus).toHaveBeenCalledWith(null);
    });
});
