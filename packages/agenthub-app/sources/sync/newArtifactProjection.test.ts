import { describe, expect, it } from 'vitest';
import { buildNewArtifactProjection } from './newArtifactProjection';

const update = {
    t: 'new-artifact' as const,
    artifactId: 'artifact-1',
    header: 'encrypted-header',
    headerVersion: 2,
    body: 'encrypted-body',
    bodyVersion: 3,
    dataEncryptionKey: 'encrypted-key',
    seq: 7,
    createdAt: 10,
    updatedAt: 20,
};

describe('buildNewArtifactProjection', () => {
    it('preserves header sessions and draft flags from realtime updates', () => {
        expect(buildNewArtifactProjection(update, {
            title: 'Notes',
            sessions: ['session-1'],
            draft: true,
        }, '')).toEqual({
            id: 'artifact-1',
            title: 'Notes',
            sessions: ['session-1'],
            draft: true,
            body: '',
            headerVersion: 2,
            bodyVersion: 3,
            seq: 7,
            createdAt: 10,
            updatedAt: 20,
            isDecrypted: true,
        });
    });

    it('represents a failed header decryption without inventing plaintext', () => {
        expect(buildNewArtifactProjection(update, null, undefined)).toMatchObject({
            title: null,
            body: undefined,
            isDecrypted: false,
        });
    });
});
