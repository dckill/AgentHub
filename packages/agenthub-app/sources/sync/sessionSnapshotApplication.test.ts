import { describe, expect, it, vi } from 'vitest';
import { applySessionSnapshot, decryptSessionSnapshot, type SessionSnapshotRecord } from './sessionSnapshotApplication';
import type { Session } from './storageTypes';

const encryptedSession = (overrides: Partial<SessionSnapshotRecord> = {}): SessionSnapshotRecord => ({
    id: 'session-1',
    tag: 'claude',
    seq: 7,
    metadata: 'encrypted-metadata',
    metadataVersion: 2,
    agentState: 'encrypted-agent-state',
    agentStateVersion: 3,
    dataEncryptionKey: 'encrypted-key',
    active: true,
    activeAt: 40,
    thinking: false,
    thinkingAt: 35,
    createdAt: 10,
    updatedAt: 40,
    lastMessage: null,
    ...overrides,
});

describe('session snapshot decryption', () => {
    it('decrypts keys and fields while preserving newer local thinking state', async () => {
        const sessionEncryption = {
            decryptMetadata: vi.fn().mockResolvedValue({
                path: '/workspace',
                host: 'host',
                currentModelCode: 'claude-3-7-sonnet',
                currentOperatingModeCode: 'remote',
            }),
            decryptAgentState: vi.fn().mockResolvedValue({ controlledByUser: false }),
        };
        const encryption = {
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([1, 2, 3])),
            initializeSessions: vi.fn().mockResolvedValue(undefined),
            getSessionEncryption: vi.fn().mockReturnValue(sessionEncryption),
        };
        const request = { assertCurrent: vi.fn(), signal: new AbortController().signal };

        const result = await decryptSessionSnapshot({
            sessions: [encryptedSession()],
            existingSessions: {
                'session-1': { thinking: true, thinkingAt: 100 } as never,
            },
            encryption,
            request,
        });

        expect(encryption.initializeSessions).toHaveBeenCalledWith(expect.any(Map));
        expect(encryption.initializeSessions.mock.calls[0][0].get('session-1')).toEqual(Uint8Array.from([1, 2, 3]));
        expect(sessionEncryption.decryptMetadata).toHaveBeenCalledWith(2, 'encrypted-metadata');
        expect(sessionEncryption.decryptAgentState).toHaveBeenCalledWith(3, 'encrypted-agent-state');
        expect(result).toEqual([expect.objectContaining({
            id: 'session-1',
            metadata: { path: '/workspace', host: 'host', currentModelCode: 'claude-3-7-sonnet', currentOperatingModeCode: 'remote' },
            agentState: { controlledByUser: false },
            thinking: true,
            thinkingAt: 100,
        })]);
        expect(request.assertCurrent).toHaveBeenCalled();
    });

    it('keeps legacy sessions and skips sessions whose key cannot be decrypted', async () => {
        const legacyEncryption = {
            decryptMetadata: vi.fn().mockResolvedValue({ path: '/legacy', host: 'host' }),
            decryptAgentState: vi.fn().mockResolvedValue({}),
        };
        const encryption = {
            decryptEncryptionKey: vi.fn().mockResolvedValue(null),
            initializeSessions: vi.fn().mockResolvedValue(undefined),
            getSessionEncryption: vi.fn().mockReturnValueOnce(legacyEncryption).mockReturnValueOnce(null),
        };
        const request = { assertCurrent: vi.fn(), signal: new AbortController().signal };

        const result = await decryptSessionSnapshot({
            sessions: [
                encryptedSession({ id: 'legacy', dataEncryptionKey: null, metadata: 'legacy-metadata', agentState: null }),
                encryptedSession({ id: 'locked' }),
            ],
            existingSessions: {},
            encryption,
            request,
        });

        expect(encryption.initializeSessions.mock.calls[0][0]).toEqual(new Map([['legacy', null]]));
        expect(result.map((item) => item.id)).toEqual(['legacy']);
        expect(result[0].metadata).toEqual({ path: '/legacy', host: 'host' });
    });
});

const projectedSession = (id: string) => ({ id } as Session);

describe('applySessionSnapshot', () => {
    it('keeps the local projection and requests retry when only part of a snapshot decrypts', () => {
        const result = applySessionSnapshot({
            rawSessionIds: ['session-1', 'session-2'],
            decryptedSessions: [projectedSession('session-1')],
            existingSessions: {
                'session-1': projectedSession('session-1'),
                'session-2': projectedSession('session-2'),
            },
            existingSessionIdsAtStart: ['session-1', 'session-2'],
        });

        expect(result.reconciledSessions.map((item) => item.id)).toEqual(['session-1', 'session-2']);
        expect(result.shouldRetry).toBe(true);
        expect(result.ignoredEmptySnapshot).toBe(false);
    });

    it('marks an unexpected empty snapshot without requesting a retry', () => {
        const result = applySessionSnapshot({
            rawSessionIds: [],
            decryptedSessions: [],
            existingSessions: { 'session-1': projectedSession('session-1') },
            existingSessionIdsAtStart: ['session-1'],
        });

        expect(result.reconciledSessions.map((item) => item.id)).toEqual(['session-1']);
        expect(result.shouldRetry).toBe(false);
        expect(result.ignoredEmptySnapshot).toBe(true);
    });

    it('does not request retry for a fully decrypted snapshot', () => {
        const result = applySessionSnapshot({
            rawSessionIds: ['session-1'],
            decryptedSessions: [projectedSession('session-1')],
            existingSessions: {},
            existingSessionIdsAtStart: [],
        });

        expect(result.shouldRetry).toBe(false);
        expect(result.ignoredEmptySnapshot).toBe(false);
    });
});
