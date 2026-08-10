import { describe, expect, it, vi } from 'vitest';
import { buildNewMessageSessionProjection } from './newMessageUpdateProjection';
import type { Session } from './storageTypes';

const session: Session = {
    id: 'session-1',
    seq: 4,
    createdAt: 10,
    updatedAt: 20,
    active: true,
    activeAt: 20,
    metadata: null,
    metadataVersion: 0,
    agentState: null,
    agentStateVersion: 0,
    thinking: false,
    thinkingAt: 0,
    presence: 'online',
    draft: 'keep this draft',
    permissionMode: 'default',
};

describe('buildNewMessageSessionProjection', () => {
    it('updates sequence/timestamp and preserves local session fields', () => {
        const projected = buildNewMessageSessionProjection(session, { seq: 5, createdAt: 30 }, null);
        expect(projected).toMatchObject({
            seq: 5,
            updatedAt: 30,
            draft: 'keep this draft',
            permissionMode: 'default',
            thinking: false,
        });
    });

    it('applies lifecycle thinking state with a fresh timestamp', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1234);
        const projected = buildNewMessageSessionProjection(session, { seq: 6, createdAt: 40 }, true);
        expect(projected.thinking).toBe(true);
        expect(projected.thinkingAt).toBe(1234);
        vi.restoreAllMocks();
    });
});
