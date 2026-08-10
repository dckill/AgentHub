import { describe, expect, it, vi } from 'vitest';
import type { Artifact } from './artifactTypes';
import { applyArtifactSnapshot } from './artifactSnapshotApplication';

const artifact: Artifact = {
    id: 'artifact-1',
    header: 'header',
    headerVersion: 2,
    dataEncryptionKey: 'encrypted-key',
    seq: 7,
    createdAt: 1,
    updatedAt: 2,
};

describe('applyArtifactSnapshot', () => {
    it('keeps valid empty plaintext and returns its data key', async () => {
        await expect(applyArtifactSnapshot({
            artifacts: [artifact],
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([1])),
            createEncryption: () => ({
                decryptHeader: vi.fn().mockResolvedValue({ title: '', sessions: [], draft: false }),
            }),
            assertCurrent: vi.fn(),
        })).resolves.toEqual({
            decryptedArtifacts: [{
                id: 'artifact-1',
                title: '',
                sessions: [],
                draft: false,
                body: undefined,
                headerVersion: 2,
                bodyVersion: undefined,
                seq: 7,
                createdAt: 1,
                updatedAt: 2,
                isDecrypted: true,
            }],
            artifactKeys: new Map([['artifact-1', Uint8Array.from([1])]]),
            failedArtifactIds: [],
        });
    });

    it('keeps successful artifacts while classifying key and header failures for retry', async () => {
        const second = { ...artifact, id: 'artifact-2' };
        const third = { ...artifact, id: 'artifact-3' };
        const decryptHeader = vi.fn()
            .mockResolvedValueOnce({ title: 'ok' })
            .mockResolvedValueOnce(null);
        const result = await applyArtifactSnapshot({
            artifacts: [artifact, second, third],
            decryptEncryptionKey: vi.fn()
                .mockResolvedValueOnce(Uint8Array.from([1]))
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce(Uint8Array.from([3])),
            createEncryption: () => ({ decryptHeader }),
            assertCurrent: vi.fn(),
        });

        expect(result.decryptedArtifacts).toHaveLength(2);
        expect(result.decryptedArtifacts[0]).toMatchObject({ id: 'artifact-1', title: 'ok', isDecrypted: true });
        expect(result.decryptedArtifacts[1]).toMatchObject({ id: 'artifact-3', title: null, isDecrypted: false });
        expect(result.artifactKeys).toEqual(new Map([
            ['artifact-1', Uint8Array.from([1])],
            ['artifact-3', Uint8Array.from([3])],
        ]));
        expect(result.failedArtifactIds).toEqual(['artifact-2', 'artifact-3']);
    });
});
