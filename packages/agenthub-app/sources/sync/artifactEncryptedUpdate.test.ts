import { describe, expect, it, vi } from 'vitest';
import type { DecryptedArtifact } from './artifactTypes';
import { applyArtifactEncryptedUpdate } from './artifactEncryptedUpdate';

const base: DecryptedArtifact = {
    id: 'artifact-1',
    title: 'Old title',
    sessions: ['s1'],
    draft: true,
    body: 'Old body',
    headerVersion: 2,
    bodyVersion: 3,
    seq: 4,
    createdAt: 10,
    updatedAt: 20,
    isDecrypted: true,
};

describe('applyArtifactEncryptedUpdate', () => {
    it('updates header and body independently with their versions', async () => {
        const result = await applyArtifactEncryptedUpdate({
            artifact: base,
            update: {
                t: 'update-artifact',
                artifactId: 'artifact-1',
                header: { version: 3, value: 'header-cipher' },
                body: { version: 4, value: 'body-cipher' },
            },
            seq: 5,
            updatedAt: 30,
            encryption: {
                decryptHeader: vi.fn().mockResolvedValue({ title: 'New title', sessions: ['s2'], draft: false }),
                decryptBody: vi.fn().mockResolvedValue({ body: 'New body' }),
            },
            assertCurrent: vi.fn(),
        });

        expect(result).toMatchObject({
            title: 'New title',
            sessions: ['s2'],
            draft: false,
            body: 'New body',
            headerVersion: 3,
            bodyVersion: 4,
            seq: 5,
            updatedAt: 30,
        });
    });

    it('retains existing fields when decryption returns null', async () => {
        const onError = vi.fn();
        const result = await applyArtifactEncryptedUpdate({
            artifact: base,
            update: {
                t: 'update-artifact',
                artifactId: 'artifact-1',
                header: { version: 3, value: 'header-cipher' },
                body: { version: 4, value: 'body-cipher' },
            },
            seq: 5,
            updatedAt: 30,
            encryption: {
                decryptHeader: vi.fn().mockResolvedValue(null),
                decryptBody: vi.fn().mockResolvedValue({ body: 'New body' }),
            },
            assertCurrent: vi.fn(),
            onError,
        });

        expect(result).toMatchObject({
            title: 'Old title',
            sessions: ['s1'],
            draft: true,
            headerVersion: 2,
            body: 'New body',
            bodyVersion: 4,
        });
        expect(onError).toHaveBeenCalledWith('header', expect.any(Error));
    });

    it('does not swallow lifecycle assertion failures', async () => {
        await expect(applyArtifactEncryptedUpdate({
            artifact: base,
            update: {
                t: 'update-artifact',
                artifactId: 'artifact-1',
                body: { version: 4, value: 'body-cipher' },
            },
            seq: 5,
            updatedAt: 30,
            encryption: {
                decryptHeader: vi.fn(),
                decryptBody: vi.fn().mockResolvedValue({ body: 'New body' }),
            },
            assertCurrent: () => { throw new Error('stale generation'); },
        })).rejects.toThrow('stale generation');
    });
});
