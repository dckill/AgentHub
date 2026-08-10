import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { Session } from './storageTypes';
import { handleUpdateSessionRealtime } from './updateSessionRealtimeHandler';

type SessionUpdate = Extract<ApiUpdate, { t: 'update-session' }>;
const session: Session = {
    id: 'session-1', seq: 3, createdAt: 1, updatedAt: 2, active: true, activeAt: 2,
    metadata: { path: '/repo', host: 'machine' }, metadataVersion: 4,
    agentState: { controlledByUser: false }, agentStateVersion: 5,
    thinking: false, thinkingAt: 0, presence: 'online', draft: 'local draft',
};
const update: SessionUpdate = { t: 'update-session', id: 'session-1' };

function createParams(overrides: Record<string, unknown> = {}) {
    return {
        session,
        encryption: { decryptMetadata: vi.fn(), decryptAgentState: vi.fn() },
        update,
        seq: 4,
        createdAt: 3,
        assertCurrent: vi.fn(),
        refreshMissingSession: vi.fn(),
        invalidateSessions: vi.fn(),
        applySession: vi.fn(),
        invalidateGitStatus: vi.fn(),
        refreshMessages: vi.fn(),
        log: vi.fn(),
        logError: vi.fn(),
        applyUpdate: vi.fn().mockResolvedValue({
            kind: 'applied',
            session,
            effects: { invalidateGitStatus: true, refreshMessages: true },
        }),
        ...overrides,
    };
}

describe('handleUpdateSessionRealtime', () => {
    it('applies the session and performs Git/message refresh effects', async () => {
        const params = createParams();

        await handleUpdateSessionRealtime(params);

        expect(params.applySession).toHaveBeenCalledWith(session);
        expect(params.invalidateGitStatus).toHaveBeenCalledWith('session-1');
        expect(params.refreshMessages).toHaveBeenCalledWith('session-1');
    });

    it.each([
        ['missing-session', false, false],
        ['missing-encryption', true, false],
    ] as const)('refreshes missing resources for %s', async (kind, hasSession, hasEncryption) => {
        const params = createParams({
            session: hasSession ? session : undefined,
            encryption: hasEncryption ? { decryptMetadata: vi.fn(), decryptAgentState: vi.fn() } : null,
            applyUpdate: vi.fn().mockResolvedValue({ kind, sessionId: 'session-1' }),
        });

        await handleUpdateSessionRealtime(params);

        expect(params.refreshMissingSession).toHaveBeenCalledWith('session-1');
        expect(params.applySession).not.toHaveBeenCalled();
    });

    it('re-checks the account and invalidates sessions for encrypted field failures', async () => {
        const params = createParams({
            applyUpdate: vi.fn().mockImplementation(async (input) => {
                input.onError('agentState', new Error('state failed'));
                return { kind: 'applied', session, effects: { invalidateGitStatus: false, refreshMessages: false } };
            }),
        });

        await handleUpdateSessionRealtime(params);

        expect(params.assertCurrent).toHaveBeenCalledTimes(2);
        expect(params.invalidateSessions).toHaveBeenCalledOnce();
        expect(params.logError).toHaveBeenCalledWith('Failed to decrypt session agentState for session-1:', expect.any(Error));
    });

    it('re-checks the account before committing the decrypted session projection', async () => {
        const staleGeneration = new Error('stale account generation');
        const assertCurrent = vi.fn()
            .mockImplementationOnce(() => undefined)
            .mockImplementationOnce(() => { throw staleGeneration; });
        const params = createParams({
            assertCurrent,
            applyUpdate: vi.fn().mockImplementation(async (input) => {
                input.assertCurrent();
                return { kind: 'applied', session, effects: { invalidateGitStatus: false, refreshMessages: false } };
            }),
        });

        await expect(handleUpdateSessionRealtime(params)).rejects.toThrow(staleGeneration);
        expect(params.applySession).not.toHaveBeenCalled();
    });
});
