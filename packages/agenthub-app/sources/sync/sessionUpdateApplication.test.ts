import { describe, expect, it, vi } from 'vitest';
import type { Session } from './storageTypes';
import { applySessionUpdate } from './sessionUpdateApplication';

const session: Session = {
    id: 'session-1', seq: 3, createdAt: 1, updatedAt: 2, active: true, activeAt: 2,
    metadata: { path: '/repo', host: 'machine' }, metadataVersion: 4,
    agentState: { controlledByUser: false }, agentStateVersion: 5,
    thinking: false, thinkingAt: 0, presence: 'online', draft: 'local draft',
};

describe('applySessionUpdate', () => {
    it('reports missing session and missing encryption before applying fields', async () => {
        const update = { t: 'update-session' as const, id: 'session-1' };
        await expect(applySessionUpdate({
            session: undefined,
            encryption: null,
            update,
            seq: 4,
            createdAt: 3,
            assertCurrent: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-session', sessionId: 'session-1' });

        await expect(applySessionUpdate({
            session,
            encryption: null,
            update,
            seq: 4,
            createdAt: 3,
            assertCurrent: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-encryption', sessionId: 'session-1' });
    });

    it('applies encrypted fields, envelope and control-handoff effects together', async () => {
        const result = await applySessionUpdate({
            session,
            encryption: {
                decryptMetadata: vi.fn().mockResolvedValue({ path: '/new', host: 'machine' }),
                decryptAgentState: vi.fn().mockResolvedValue({ controlledByUser: true }),
            },
            update: {
                t: 'update-session',
                id: 'session-1',
                metadata: { version: 6, value: 'metadata' },
                agentState: { version: 7, value: 'agent-state' },
            },
            seq: 8,
            createdAt: 10,
            assertCurrent: vi.fn(),
        });

        expect(result).toMatchObject({
            kind: 'applied',
            session: { metadata: { path: '/new' }, agentState: { controlledByUser: true }, seq: 8, updatedAt: 10 },
            effects: { invalidateGitStatus: true, refreshMessages: true },
        });
    });
});
