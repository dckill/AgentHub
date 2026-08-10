import { describe, expect, it, vi } from 'vitest';
import { cleanupDeletedSession } from './sessionDeleteCleanup';

describe('cleanupDeletedSession', () => {
    it('clears every session-scoped resource in the same order as deletion handling', () => {
        const calls: string[] = [];
        const mark = (name: string) => vi.fn(() => calls.push(name));

        cleanupDeletedSession('session-1', {
            clearGitStatus: mark('git'),
            deleteMessagesSync: mark('messages'),
            deleteSendSync: mark('send'),
            deleteOlderMessagesSync: mark('older'),
            clearOlderMessagesRetryGuard: mark('retry'),
            deletePendingOutbox: mark('outbox'),
            clearMessagePagination: mark('pagination'),
            clearMessageIngest: mark('ingest'),
        });

        expect(calls).toEqual([
            'git',
            'messages',
            'send',
            'older',
            'retry',
            'outbox',
            'pagination',
            'ingest',
        ]);
    });
});
