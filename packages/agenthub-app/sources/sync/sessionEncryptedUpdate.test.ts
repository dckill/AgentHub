import { describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';
import { applySessionEncryptedUpdate } from './sessionEncryptedUpdate';

const session: Session = {
    id: 'session-1', seq: 3, createdAt: 1, updatedAt: 2, active: true, activeAt: 2,
    metadata: { path: '/repo', host: 'machine' }, metadataVersion: 4,
    agentState: { controlledByUser: false }, agentStateVersion: 5,
    thinking: false, thinkingAt: 0, presence: 'online',
};

describe('applySessionEncryptedUpdate', () => {
    it('preserves each existing field when its decryptor returns null', async () => {
        const updated = await applySessionEncryptedUpdate({
            session,
            update: {
                t: 'update-session', id: session.id,
                metadata: { version: 6, value: 'bad-metadata' },
                agentState: { version: 7, value: 'bad-state' },
            },
            encryption: {
                decryptMetadata: vi.fn(async () => null),
                decryptAgentState: vi.fn(async () => null),
            },
            assertCurrent: vi.fn(),
        });

        expect(updated.metadata).toEqual(session.metadata);
        expect(updated.metadataVersion).toBe(session.metadataVersion);
        expect(updated.agentState).toEqual(session.agentState);
        expect(updated.agentStateVersion).toBe(session.agentStateVersion);
    });

    it('applies valid fields independently when the other field fails', async () => {
        const onError = vi.fn();
        const updated = await applySessionEncryptedUpdate({
            session,
            update: {
                t: 'update-session', id: session.id,
                metadata: { version: 6, value: 'good-metadata' },
                agentState: { version: 7, value: 'bad-state' },
            },
            encryption: {
                decryptMetadata: vi.fn(async () => ({ path: '/new', host: 'machine' })),
                decryptAgentState: vi.fn(async () => null),
            },
            assertCurrent: vi.fn(),
            onError,
        });

        expect(updated.metadata).toEqual({ path: '/new', host: 'machine' });
        expect(updated.metadataVersion).toBe(6);
        expect(updated.agentState).toEqual(session.agentState);
        expect(updated.agentStateVersion).toBe(session.agentStateVersion);
        expect(onError).toHaveBeenCalledWith('agentState', expect.any(Error));
    });
});
