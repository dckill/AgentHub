import { describe, expect, it } from 'vitest';
import type { Session } from './storageTypes';
import { buildSessionEnvelopeProjection } from './sessionEnvelopeProjection';

const session: Session = {
    id: 'session-1',
    seq: 4,
    createdAt: 10,
    updatedAt: 20,
    active: true,
    activeAt: 20,
    metadata: {
        path: '/workspace',
        host: 'host',
        currentModelCode: 'claude-3-7-sonnet',
        currentOperatingModeCode: 'remote',
    },
    metadataVersion: 2,
    agentState: { controlledByUser: false },
    agentStateVersion: 3,
    thinking: false,
    thinkingAt: 0,
    presence: 'online',
    draft: 'keep local draft',
    permissionMode: 'acceptEdits',
};

describe('buildSessionEnvelopeProjection', () => {
    it('updates only sequence envelope fields', () => {
        expect(buildSessionEnvelopeProjection(session, 8, 40)).toEqual({
            ...session,
            seq: 8,
            updatedAt: 40,
        });
    });
});
