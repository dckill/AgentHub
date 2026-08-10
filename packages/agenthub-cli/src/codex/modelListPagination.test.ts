import { describe, expect, it, vi } from 'vitest';

import { fetchAllCodexModels } from './modelListPagination';
import type { CodexModel } from './codexAppServerTypes';

const model = (name: string): CodexModel => ({
    id: `${name}-id`,
    model: name,
    displayName: name,
    description: '',
    hidden: false,
    isDefault: false,
    supportedReasoningEfforts: [],
    defaultReasoningEffort: 'medium',
});

describe('fetchAllCodexModels', () => {
    it('paginates with the returned cursor and de-duplicates models by model name', async () => {
        const fetchPage = vi.fn()
            .mockResolvedValueOnce({ data: [model('alpha'), model('beta')], nextCursor: 'cursor-2' })
            .mockResolvedValueOnce({ data: [model('beta'), model('gamma')], nextCursor: null });

        await expect(fetchAllCodexModels({ includeHidden: true, fetchPage })).resolves.toEqual([
            model('alpha'),
            model('beta'),
            model('gamma'),
        ]);
        expect(fetchPage).toHaveBeenNthCalledWith(1, { cursor: null, limit: 100, includeHidden: true });
        expect(fetchPage).toHaveBeenNthCalledWith(2, { cursor: 'cursor-2', limit: 100, includeHidden: true });
    });

    it('returns an empty list without issuing a second page request', async () => {
        const fetchPage = vi.fn().mockResolvedValue({ data: [], nextCursor: null });

        await expect(fetchAllCodexModels({ includeHidden: false, fetchPage })).resolves.toEqual([]);
        expect(fetchPage).toHaveBeenCalledTimes(1);
    });

    it('propagates a failed model/list request without hiding the transport error', async () => {
        const error = new Error('model list unavailable');
        const fetchPage = vi.fn().mockRejectedValue(error);

        await expect(fetchAllCodexModels({ includeHidden: false, fetchPage })).rejects.toBe(error);
    });
});
