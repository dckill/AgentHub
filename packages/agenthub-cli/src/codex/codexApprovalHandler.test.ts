import { describe, expect, it, vi } from 'vitest';
import { resolveCodexApproval } from './codexApprovalHandler';

describe('resolveCodexApproval', () => {
    const params = { type: 'exec' as const, callId: 'call-1' };

    it('defaults to denied when no approval handler is configured', async () => {
        await expect(resolveCodexApproval(null, params)).resolves.toBe('denied');
    });

    it('returns the handler decision unchanged', async () => {
        const handler = vi.fn(async () => 'approved' as const);

        await expect(resolveCodexApproval(handler, params)).resolves.toBe('approved');
        expect(handler).toHaveBeenCalledWith(params);
    });

    it('fails closed and reports handler errors', async () => {
        const error = new Error('approval UI unavailable');
        const handler = vi.fn(async () => { throw error; });
        const onError = vi.fn();

        await expect(resolveCodexApproval(handler, params, onError)).resolves.toBe('denied');
        expect(onError).toHaveBeenCalledWith(error);
    });
});
