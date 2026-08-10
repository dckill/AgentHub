import { describe, expect, it } from 'vitest';
import { buildDecryptedSessionProjection } from './sessionDecryptionProjection';

describe('buildDecryptedSessionProjection', () => {
    it('combines decrypted payload and resolved thinking state without dropping the server envelope', () => {
        const session = {
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
            thinking: true,
            thinkingAt: 40,
            createdAt: 10,
            updatedAt: 40,
            lastMessage: null,
        };

        expect(buildDecryptedSessionProjection(
            session,
            { path: '/workspace', host: 'host', currentModelCode: 'claude-3-7-sonnet', currentOperatingModeCode: 'remote' },
            { controlledByUser: false },
            { thinking: false, thinkingAt: 35 },
        )).toEqual({
            ...session,
            metadata: { path: '/workspace', host: 'host', currentModelCode: 'claude-3-7-sonnet', currentOperatingModeCode: 'remote' },
            agentState: { controlledByUser: false },
            thinking: false,
            thinkingAt: 35,
        });
    });
});
