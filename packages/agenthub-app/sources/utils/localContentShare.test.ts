import { describe, expect, it, vi } from 'vitest';

import { shareLocalContent } from './localContentShare';

describe('shareLocalContent', () => {
    it('shares only the explicitly supplied local text', async () => {
        const share = vi.fn(async () => ({ action: 'sharedAction' }));

        await expect(shareLocalContent({
            text: 'selected block',
            title: 'Selected text',
            share,
        })).resolves.toBe('shared');
        expect(share).toHaveBeenCalledWith({
            message: 'selected block',
            title: 'Selected text',
        });
    });

    it('does not open a share sheet for empty content', async () => {
        const share = vi.fn();
        await expect(shareLocalContent({ text: '  ', title: 'Selected text', share })).resolves.toBe('empty');
        expect(share).not.toHaveBeenCalled();
    });

    it('treats native dismissal and browser cancellation as non-errors', async () => {
        await expect(shareLocalContent({
            text: 'selected block',
            title: 'Selected text',
            share: async () => ({ action: 'dismissedAction' }),
        })).resolves.toBe('dismissed');

        const abort = new Error('Share canceled');
        abort.name = 'AbortError';
        await expect(shareLocalContent({
            text: 'selected block',
            title: 'Selected text',
            share: async () => { throw abort; },
        })).resolves.toBe('dismissed');
    });

    it('does not swallow an unsupported or failed share provider', async () => {
        await expect(shareLocalContent({
            text: 'selected block',
            title: 'Selected text',
            share: async () => { throw new Error('Share is not supported in this browser'); },
        })).rejects.toThrow('Share is not supported');
    });
});
