import { describe, expect, it, vi } from 'vitest';
import { rejectPendingCodexRequests } from './codexPendingRequestCleanup';
import type { PendingCodexRequest } from './codexResponseResolution';

function request(epoch: number, method: string): PendingCodexRequest {
    return { epoch, method, resolve: vi.fn(), reject: vi.fn() };
}

describe('rejectPendingCodexRequests', () => {
    it('rejects and removes only requests from the disconnected epoch', () => {
        const pending = new Map<number, PendingCodexRequest>([
            [1, request(3, 'thread/read')],
            [2, request(2, 'turn/start')],
            [3, request(3, 'model/list')],
        ]);
        const error = new Error('Codex process disconnected');

        expect(rejectPendingCodexRequests(pending, 3, () => error)).toBe(2);
        expect(pending.has(1)).toBe(false);
        expect(pending.has(3)).toBe(false);
        expect(pending.has(2)).toBe(true);
    });

    it('uses each request method when constructing the rejection error', () => {
        const first = request(4, 'thread/read');
        const pending = new Map([[1, first]]);

        rejectPendingCodexRequests(pending, 4, (method) => new Error(`disconnected while waiting for ${method}`));

        expect(first.reject).toHaveBeenCalledWith(new Error('disconnected while waiting for thread/read'));
    });
});
