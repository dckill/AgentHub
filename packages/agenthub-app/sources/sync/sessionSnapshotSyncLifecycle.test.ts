import { describe, expect, it, vi } from 'vitest';
import { runSessionSnapshotSync } from './sessionSnapshotSyncLifecycle';

function createSessionRecord(id: string, dataEncryptionKey: string | null = null) {
    return {
        id,
        tag: 'codex',
        seq: 1,
        metadata: `metadata-${id}`,
        metadataVersion: 1,
        agentState: `state-${id}`,
        agentStateVersion: 1,
        dataEncryptionKey,
        active: false,
        activeAt: 0,
        thinking: false,
        thinkingAt: null,
        createdAt: 1,
        updatedAt: 2,
        lastMessage: null,
    };
}

describe('session snapshot sync lifecycle', () => {
    it('fetches all cursor pages, decrypts them, and applies one authoritative snapshot', async () => {
        const pages = new Map<string | null, ReturnType<typeof createSessionRecord>[]>([
            [null, [createSessionRecord('s1')]],
            ['cursor-1', [createSessionRecord('s2')]],
        ]);
        const cursors: Array<string | null> = [];
        const applySessions = vi.fn();

        await runSessionSnapshotSync({
            generation: 7,
            assertCurrent: vi.fn(),
            existingSessions: {},
            existingSessionIdsAtStart: [],
            runRequest: async (_generation, operation) => operation({
                signal: new AbortController().signal,
                assertCurrent: vi.fn(),
            }),
            fetchPage: async (cursor) => {
                cursors.push(cursor);
                const sessions = pages.get(cursor) ?? [];
                return {
                    items: sessions,
                    nextCursor: cursor === null ? 'cursor-1' : null,
                    hasNext: cursor === null,
                };
            },
            encryption: {
                decryptEncryptionKey: vi.fn(async () => null),
                initializeSessions: vi.fn(async () => undefined),
                getSessionEncryption: vi.fn(() => ({
                    decryptMetadata: vi.fn(async () => ({ title: 'title' })),
                    decryptAgentState: vi.fn(async () => ({ controlledByUser: false })),
                } as never)),
            },
            applySessions,
            scheduleRetry: vi.fn(),
            onIgnoredEmptySnapshot: vi.fn(),
            log: vi.fn(),
        });

        expect(cursors).toEqual([null, 'cursor-1']);
        expect(applySessions).toHaveBeenCalledWith(
            expect.arrayContaining([
                expect.objectContaining({ id: 's1' }),
                expect.objectContaining({ id: 's2' }),
            ]),
            true,
        );
    });

    it('schedules a retry when a fetched session cannot be decrypted', async () => {
        const scheduleRetry = vi.fn();

        await runSessionSnapshotSync({
            generation: 3,
            assertCurrent: vi.fn(),
            existingSessions: { retained: { active: false, thinking: false, thinkingAt: null } as never },
            existingSessionIdsAtStart: ['retained'],
            runRequest: async (_generation, operation) => operation({
                signal: new AbortController().signal,
                assertCurrent: vi.fn(),
            }),
            fetchPage: async () => ({
                items: [createSessionRecord('unreadable', 'encrypted-key')],
                nextCursor: null,
                hasNext: false,
            }),
            encryption: {
                decryptEncryptionKey: vi.fn(async () => null),
                initializeSessions: vi.fn(async () => undefined),
                getSessionEncryption: vi.fn(),
            },
            applySessions: vi.fn(),
            scheduleRetry,
            onIgnoredEmptySnapshot: vi.fn(),
            log: vi.fn(),
        });

        expect(scheduleRetry).toHaveBeenCalledTimes(1);
    });

    it('does not apply a snapshot after the account generation becomes stale', async () => {
        let current = true;
        const applySessions = vi.fn();

        await expect(runSessionSnapshotSync({
            generation: 8,
            existingSessions: {},
            existingSessionIdsAtStart: [],
            runRequest: async (_generation, operation) => {
                const result = await operation({
                    signal: new AbortController().signal,
                    assertCurrent: vi.fn(),
                });
                current = false;
                return result;
            },
            assertCurrent: () => {
                if (!current) throw new DOMException('Account lifecycle is stale', 'AbortError');
            },
            fetchPage: async () => ({ items: [], nextCursor: null, hasNext: false }),
            encryption: {
                decryptEncryptionKey: vi.fn(async () => null),
                initializeSessions: vi.fn(async () => undefined),
                getSessionEncryption: vi.fn(),
            },
            applySessions,
            scheduleRetry: vi.fn(),
            onIgnoredEmptySnapshot: vi.fn(),
            log: vi.fn(),
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(applySessions).not.toHaveBeenCalled();
    });
});
