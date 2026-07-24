import { describe, expect, it, vi } from 'vitest';
import { fetchCompleteCursorSnapshot } from './cursorSnapshot';

describe('fetchCompleteCursorSnapshot', () => {
    it('collects every page before returning an authoritative snapshot', async () => {
        const fetchPage = vi.fn()
            .mockResolvedValueOnce({ items: ['a', 'b'], hasNext: true, nextCursor: 'cursor-b' })
            .mockResolvedValueOnce({ items: ['c'], hasNext: false, nextCursor: null });

        await expect(fetchCompleteCursorSnapshot(fetchPage)).resolves.toEqual(['a', 'b', 'c']);
        expect(fetchPage.mock.calls).toEqual([[null], ['cursor-b']]);
    });

    it('rejects incomplete or looping pagination instead of applying a partial snapshot', async () => {
        await expect(fetchCompleteCursorSnapshot(async () => ({
            items: ['a'], hasNext: true, nextCursor: null,
        }))).rejects.toThrow('did not provide a cursor');

        const looping = vi.fn()
            .mockResolvedValueOnce({ items: ['a'], hasNext: true, nextCursor: 'same' })
            .mockResolvedValueOnce({ items: ['b'], hasNext: true, nextCursor: 'same' });
        await expect(fetchCompleteCursorSnapshot(looping)).rejects.toThrow('repeated cursor');
    });
});
