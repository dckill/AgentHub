import { describe, expect, it, vi } from 'vitest';
import type { Artifact } from './artifactTypes';
import { applyArtifactCreate } from './artifactCreateApplication';

const serverArtifact: Artifact = {
    id: 'artifact-1',
    header: 'header-cipher',
    headerVersion: 1,
    body: 'body-cipher',
    bodyVersion: 1,
    dataEncryptionKey: 'wrapped-key',
    seq: 1,
    createdAt: 10,
    updatedAt: 11,
};

describe('applyArtifactCreate', () => {
    it('encrypts the request and projects the created artifact', async () => {
        const assertCurrent = vi.fn();
        const createArtifact = vi.fn().mockResolvedValue(serverArtifact);
        const dataEncryptionKey = Uint8Array.from([1, 2, 3]);

        await expect(applyArtifactCreate({
            title: '',
            body: '',
            sessions: ['session-1'],
            draft: false,
            generateId: () => 'artifact-1',
            generateDataEncryptionKey: () => dataEncryptionKey,
            encryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([4, 5, 6])),
            createEncryption: () => ({
                encryptHeader: vi.fn().mockResolvedValue('header-cipher'),
                encryptBody: vi.fn().mockResolvedValue('body-cipher'),
            }),
            createArtifact,
            assertCurrent,
        })).resolves.toEqual({
            artifactId: 'artifact-1',
            dataEncryptionKey,
            decryptedArtifact: {
                id: 'artifact-1',
                title: '',
                sessions: ['session-1'],
                draft: false,
                body: '',
                headerVersion: 1,
                bodyVersion: 1,
                seq: 1,
                createdAt: 10,
                updatedAt: 11,
                isDecrypted: true,
            },
        });
        expect(createArtifact).toHaveBeenCalledWith(expect.objectContaining({
            id: 'artifact-1',
            header: 'header-cipher',
            body: 'body-cipher',
            dataEncryptionKey: expect.any(String),
        }));
        expect(assertCurrent).toHaveBeenCalledTimes(2);
    });

    it('stops before API creation when account encryption fails', async () => {
        const createArtifact = vi.fn();
        await expect(applyArtifactCreate({
            title: 'title',
            body: 'body',
            generateId: () => 'artifact-1',
            generateDataEncryptionKey: () => Uint8Array.from([1]),
            encryptEncryptionKey: vi.fn().mockRejectedValue(new Error('key encryption failed')),
            createEncryption: vi.fn(),
            createArtifact,
            assertCurrent: vi.fn(),
        })).rejects.toThrow('key encryption failed');
        expect(createArtifact).not.toHaveBeenCalled();
    });

    it('propagates API creation failures without projecting a local artifact', async () => {
        const createArtifact = vi.fn().mockRejectedValue(new Error('create failed'));
        await expect(applyArtifactCreate({
            title: 'title',
            body: 'body',
            generateId: () => 'artifact-1',
            generateDataEncryptionKey: () => Uint8Array.from([1]),
            encryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([2])),
            createEncryption: () => ({
                encryptHeader: vi.fn().mockResolvedValue('header'),
                encryptBody: vi.fn().mockResolvedValue('body'),
            }),
            createArtifact,
            assertCurrent: vi.fn(),
        })).rejects.toThrow('create failed');
    });
});
