import { describe, expect, it, vi } from 'vitest';
import { handleCodexServerRequestLifecycle } from './codexServerRequestLifecycle';

describe('codex server request lifecycle wiring', () => {
    it('forwards unknown requests to the client response callback', async () => {
        const respondUnknown = vi.fn();
        await handleCodexServerRequestLifecycle({
            id: 17,
            method: 'unknown/request',
            params: {},
            rawFileChangesByItemId: new Map(),
            createApprovalResponder: vi.fn(),
            handleApproval: vi.fn(),
            respondUnknown,
        });

        expect(respondUnknown).toHaveBeenCalledWith(17, 'unknown/request');
    });

    it('keeps approval callbacks and raw file-change state injectable', async () => {
        const handleApproval = vi.fn(async () => 'approved' as const);
        const rawFileChangesByItemId = new Map([['item-1', { 'a.txt': { diff: 'diff' } }]]);
        const respond = vi.fn();
        const createApprovalResponder = vi.fn(() => respond);

        await handleCodexServerRequestLifecycle({
            id: 18,
            method: 'item/fileChange/requestApproval',
            params: { itemId: 'item-1', reason: 'review' },
            rawFileChangesByItemId,
            createApprovalResponder,
            handleApproval,
            respondUnknown: vi.fn(),
        });

        expect(handleApproval).toHaveBeenCalledWith(expect.objectContaining({
            type: 'patch',
            callId: 'item-1',
            fileChanges: { 'a.txt': { diff: 'diff' } },
        }));
        expect(createApprovalResponder).toHaveBeenCalledWith(18, expect.anything());
        expect(respond).toHaveBeenCalledOnce();
    });
});
