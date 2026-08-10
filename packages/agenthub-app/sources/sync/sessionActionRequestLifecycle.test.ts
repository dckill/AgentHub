import { describe, expect, it, vi } from 'vitest';
import { runSessionActionRequest } from './sessionActionRequestLifecycle';

describe('session action request lifecycle', () => {
    it('does not start a request when the account is already stale', async () => {
        const request = vi.fn(async () => 'old-result');

        const result = await runSessionActionRequest({
            isCurrent: () => false,
            request,
        });

        expect(result).toBeNull();
        expect(request).not.toHaveBeenCalled();
    });

    it('drops a response that arrives after the account changes', async () => {
        const isCurrent = vi.fn()
            .mockReturnValueOnce(true)
            .mockReturnValue(false);

        const result = await runSessionActionRequest({
            isCurrent,
            request: vi.fn(async () => 'old-result'),
        });

        expect(result).toBeNull();
    });

    it('returns the response while the originating account remains current', async () => {
        const result = await runSessionActionRequest({
            isCurrent: () => true,
            request: vi.fn(async () => 'current-result'),
        });

        expect(result).toBe('current-result');
    });
});
