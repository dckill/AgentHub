import { describe, expect, it } from 'vitest';
import { reconcileSessionSnapshot } from './sessionSnapshot';
import type { Session } from './storageTypes';

function session(id: string, overrides: Partial<Session> = {}): Session {
    return {
        id,
        seq: 1,
        metadata: { machineId: 'machine-1', host: 'devbox', path: '/repo', homeDir: '/home/dev' },
        metadataVersion: 1,
        agentState: null,
        agentStateVersion: 1,
        active: true,
        activeAt: 10,
        presence: 'online',
        thinking: false,
        thinkingAt: 10,
        createdAt: 1,
        updatedAt: 10,
        ...overrides,
    };
}

describe('reconcileSessionSnapshot', () => {
    it('keeps the last known sessions when a refresh unexpectedly returns an empty snapshot', () => {
        const existing = session('existing');

        const result = reconcileSessionSnapshot({
            rawSessionIds: [],
            decryptedSessions: [],
            existingSessions: { existing },
        });

        expect(result).toEqual([existing]);
    });

    it('keeps an existing session when its record is present but cannot be decrypted', () => {
        const failed = session('failed');
        const fresh = session('fresh');

        const result = reconcileSessionSnapshot({
            rawSessionIds: ['failed', 'fresh'],
            decryptedSessions: [fresh],
            existingSessions: { failed },
        });

        expect(result.map((item) => item.id)).toEqual(['failed', 'fresh']);
    });

    it('keeps the last known sessions when every non-empty snapshot record fails to decrypt', () => {
        const existing = session('existing');

        const result = reconcileSessionSnapshot({
            rawSessionIds: ['replacement'],
            decryptedSessions: [],
            existingSessions: { existing },
        });

        expect(result).toEqual([existing]);
    });

    it('does not let an older REST snapshot overwrite newer socket state', () => {
        const existing = session('session-1', {
            seq: 9,
            updatedAt: 90,
            active: true,
            activeAt: 90,
            thinking: true,
            thinkingAt: 90,
            metadataVersion: 3,
            metadata: { machineId: 'machine-1', host: 'devbox', path: '/new', homeDir: '/home/dev' },
        });
        const stale = session('session-1', {
            seq: 8,
            updatedAt: 80,
            active: false,
            activeAt: 80,
            thinking: false,
            thinkingAt: 80,
            metadataVersion: 2,
            metadata: { machineId: 'machine-1', host: 'devbox', path: '/old', homeDir: '/home/dev' },
        });

        const [result] = reconcileSessionSnapshot({
            rawSessionIds: ['session-1'],
            decryptedSessions: [stale],
            existingSessions: { 'session-1': existing },
        });

        expect(result).toMatchObject({
            seq: 9,
            updatedAt: 90,
            active: true,
            activeAt: 90,
            thinking: true,
            thinkingAt: 90,
            metadataVersion: 3,
            metadata: expect.objectContaining({ path: '/new' }),
        });
    });

    it('removes sessions absent from a non-empty complete snapshot', () => {
        const kept = session('kept');

        const result = reconcileSessionSnapshot({
            rawSessionIds: ['kept'],
            decryptedSessions: [kept],
            existingSessions: { kept, removed: session('removed') },
        });

        expect(result.map((item) => item.id)).toEqual(['kept']);
    });

    it('keeps sessions created locally while the paginated snapshot is in flight', () => {
        const kept = session('kept');
        const createdDuringRefresh = session('new-during-refresh');

        const result = reconcileSessionSnapshot({
            rawSessionIds: ['kept'],
            decryptedSessions: [kept],
            existingSessions: { kept, 'new-during-refresh': createdDuringRefresh },
            existingSessionIdsAtStart: ['kept'],
        });

        expect(result.map((item) => item.id)).toEqual(['kept', 'new-during-refresh']);
    });
});
