import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';
import { applyArtifactUpdate } from './artifactUpdateApplication';

type ArtifactUpdate = Extract<ApiUpdate, { t: 'update-artifact' }>;

const artifact: DecryptedArtifact = {
    id: 'artifact-1',
    title: '旧标题',
    body: '旧正文',
    headerVersion: 1,
    bodyVersion: 1,
    seq: 2,
    createdAt: 10,
    updatedAt: 10,
    isDecrypted: true,
};

const update: ArtifactUpdate = {
    t: 'update-artifact',
    artifactId: 'artifact-1',
    header: { value: 'header', version: 2 },
    body: { value: 'body', version: 2 },
};

describe('applyArtifactUpdate', () => {
    it('applies encrypted fields and returns an updated artifact', async () => {
        const encryption = {
            decryptHeader: vi.fn().mockResolvedValue({ title: '新标题' }),
            decryptBody: vi.fn().mockResolvedValue({ body: '新正文' }),
        };

        await expect(applyArtifactUpdate({
            artifact,
            dataEncryptionKey: Uint8Array.from([1]),
            update,
            seq: 3,
            updatedAt: 20,
            createEncryption: () => encryption,
            assertCurrent: vi.fn(),
            onError: vi.fn(),
        })).resolves.toEqual({
            kind: 'updated',
            artifact: expect.objectContaining({
                title: '新标题',
                body: '新正文',
                headerVersion: 2,
                bodyVersion: 2,
                seq: 3,
                updatedAt: 20,
            }),
        });
    });

    it('reports missing local state without constructing an encryption instance', async () => {
        const createEncryption = vi.fn();

        await expect(applyArtifactUpdate({
            artifact: undefined,
            dataEncryptionKey: Uint8Array.from([1]),
            update,
            seq: 3,
            updatedAt: 20,
            createEncryption,
            assertCurrent: vi.fn(),
            onError: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-artifact' });
        expect(createEncryption).not.toHaveBeenCalled();
    });

    it('reports a missing data key separately from a missing artifact', async () => {
        await expect(applyArtifactUpdate({
            artifact,
            dataEncryptionKey: undefined,
            update,
            seq: 3,
            updatedAt: 20,
            createEncryption: vi.fn(),
            assertCurrent: vi.fn(),
            onError: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-key' });
    });
});
