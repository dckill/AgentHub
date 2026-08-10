import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
    const controller = new AbortController();
    return {
        controller,
        keepAlive: vi.fn(),
        backoff: vi.fn(),
    };
});

vi.mock('./shutdown', () => ({
    keepAlive: mocks.keepAlive,
    shutdownSignal: mocks.controller.signal,
}));
vi.mock('./backoff', () => ({ backoff: mocks.backoff }));

import { forever } from './forever';

describe('forever background loop observer', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('reports a failure and a later recovery without changing retry control flow', async () => {
        let keepAliveCallback: (() => Promise<void>) | undefined;
        mocks.keepAlive.mockImplementation((_name: string, callback: () => Promise<void>) => {
            keepAliveCallback = callback;
        });
        mocks.backoff.mockImplementation(async (callback: () => Promise<void>) => {
            try {
                await callback();
            } catch {
                await callback();
            }
        });

        const callback = vi.fn()
            .mockRejectedValueOnce(new Error('temporary database failure'))
            .mockImplementationOnce(async () => {
                mocks.controller.abort();
            });
        const observer = {
            onFailure: vi.fn(),
            onSuccess: vi.fn(),
        };

        await forever('session-timeout', callback, observer);
        await keepAliveCallback?.();

        expect(mocks.backoff).toHaveBeenCalledOnce();
        expect(callback).toHaveBeenCalledTimes(2);
        expect(observer.onFailure).toHaveBeenCalledWith(
            'session-timeout',
            expect.any(Error),
            1,
        );
        expect(observer.onSuccess).toHaveBeenCalledWith('session-timeout');
    });
});
