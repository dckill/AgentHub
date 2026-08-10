import { describe, expect, it, vi } from 'vitest';
import type { Artifact } from './artifactTypes';
import { applyArtifactBodyFetch } from './artifactBodyFetchApplication';

const artifact: Artifact = {
    id: 'artifact-1',
    header: 'header-cipher',
    headerVersion: 4,
    body: 'body-cipher',
    bodyVersion: 5,
    dataEncryptionKey: 'wrapped-key',
    seq: 9,
    createdAt: 10,
    updatedAt: 11,
};

describe('applyArtifactBodyFetch', () => {
    it('projects decrypted header and body while preserving artifact metadata', async () => {
        const assertCurrent = vi.fn();
        const decryptedKey = Uint8Array.from([1, 2, 3]);

        await expect(applyArtifactBodyFetch({
            artifact,
            decryptEncryptionKey: vi.fn().mockResolvedValue(decryptedKey),
            createEncryption: () => ({
                decryptHeader: vi.fn().mockResolvedValue({ title: '', sessions: ['session-1'], draft: false }),
                decryptBody: vi.fn().mockResolvedValue({ body: '' }),
            }),
            assertCurrent,
        })).resolves.toEqual({
            artifact: {
                id: 'artifact-1',
                title: '',
                sessions: ['session-1'],
                draft: false,
                body: '',
                headerVersion: 4,
                bodyVersion: 5,
                seq: 9,
                createdAt: 10,
                updatedAt: 11,
                isDecrypted: true,
            },
            decryptedKey,
        });
        expect(assertCurrent).toHaveBeenCalledTimes(2);
    });

    it('fails closed when the wrapped data key cannot be decrypted', async () => {
        await expect(applyArtifactBodyFetch({
            artifact,
            decryptEncryptionKey: vi.fn().mockResolvedValue(null),
            createEncryption: vi.fn(),
            assertCurrent: vi.fn(),
        })).rejects.toThrow('Failed to decrypt key for artifact artifact-1');
    });

    it('fails closed for missing header or an explicitly missing body', async () => {
        const createEncryption = () => ({
            decryptHeader: vi.fn().mockResolvedValue(null),
            decryptBody: vi.fn().mockResolvedValue(null),
        });

        await expect(applyArtifactBodyFetch({
            artifact,
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([1])),
            createEncryption,
            assertCurrent: vi.fn(),
        })).rejects.toThrow('Failed to decrypt header for artifact artifact-1');

        await expect(applyArtifactBodyFetch({
            artifact,
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([1])),
            createEncryption: () => ({
                decryptHeader: vi.fn().mockResolvedValue({ title: 'title' }),
                decryptBody: vi.fn().mockResolvedValue(null),
            }),
            assertCurrent: vi.fn(),
        })).rejects.toThrow('Failed to decrypt body for artifact artifact-1');

        await expect(applyArtifactBodyFetch({
            artifact: { ...artifact, body: undefined, bodyVersion: undefined },
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([1])),
            createEncryption: () => ({
                decryptHeader: vi.fn().mockResolvedValue({ title: 'title' }),
                decryptBody: vi.fn(),
            }),
            assertCurrent: vi.fn(),
        })).resolves.toMatchObject({
            artifact: { title: 'title', body: null, isDecrypted: true },
        });
    });
});
