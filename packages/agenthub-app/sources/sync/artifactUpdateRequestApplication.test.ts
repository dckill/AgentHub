import { describe, expect, it, vi } from 'vitest';
import type { DecryptedArtifact } from './artifactTypes';
import { applyArtifactUpdateRequest } from './artifactUpdateRequestApplication';

const currentArtifact: DecryptedArtifact = {
    id: 'artifact-1',
    title: 'Old title',
    sessions: ['session-1'],
    draft: false,
    body: 'Old body',
    headerVersion: 2,
    bodyVersion: 3,
    seq: 4,
    createdAt: 10,
    updatedAt: 20,
    isDecrypted: true,
};

describe('applyArtifactUpdateRequest', () => {
    it('encrypts changed fields and projects the server versions', async () => {
        const updateArtifact = vi.fn().mockResolvedValue({
            success: true,
            headerVersion: 3,
            bodyVersion: 4,
        });
        const dataEncryptionKey = Uint8Array.from([1, 2, 3]);

        await expect(applyArtifactUpdateRequest({
            artifactId: 'artifact-1',
            title: 'New title',
            body: 'New body',
            sessions: ['session-2'],
            draft: true,
            currentArtifact,
            dataEncryptionKey,
            fetchArtifact: vi.fn(),
            decryptEncryptionKey: vi.fn(),
            createEncryption: () => ({
                encryptHeader: vi.fn().mockResolvedValue('header-cipher'),
                encryptBody: vi.fn().mockResolvedValue('body-cipher'),
            }),
            updateArtifact,
            areArtifactSessionsEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right),
            assertCurrent: vi.fn(),
            now: () => 30,
        })).resolves.toMatchObject({
            dataEncryptionKey,
            updatedArtifact: {
                id: 'artifact-1',
                title: 'New title',
                body: 'New body',
                sessions: ['session-2'],
                draft: true,
                headerVersion: 3,
                bodyVersion: 4,
                updatedAt: 30,
            },
        });
        expect(updateArtifact).toHaveBeenCalledWith({
            header: 'header-cipher',
            expectedHeaderVersion: 2,
            body: 'body-cipher',
            expectedBodyVersion: 3,
        });
    });

    it('skips the API when neither header nor body changed', async () => {
        const updateArtifact = vi.fn();
        await expect(applyArtifactUpdateRequest({
            artifactId: 'artifact-1',
            title: currentArtifact.title,
            body: currentArtifact.body ?? null,
            sessions: currentArtifact.sessions,
            draft: currentArtifact.draft,
            currentArtifact,
            dataEncryptionKey: Uint8Array.from([1]),
            fetchArtifact: vi.fn(),
            decryptEncryptionKey: vi.fn(),
            createEncryption: () => ({
                encryptHeader: vi.fn(),
                encryptBody: vi.fn(),
            }),
            updateArtifact,
            areArtifactSessionsEqual: (left, right) => JSON.stringify(left) === JSON.stringify(right),
            assertCurrent: vi.fn(),
            now: () => 30,
        })).resolves.toBeNull();
        expect(updateArtifact).not.toHaveBeenCalled();
    });

    it('fails closed when a fallback fetch cannot unwrap the artifact key', async () => {
        await expect(applyArtifactUpdateRequest({
            artifactId: 'artifact-1',
            title: 'New title',
            body: currentArtifact.body ?? null,
            sessions: currentArtifact.sessions,
            draft: currentArtifact.draft,
            currentArtifact: { ...currentArtifact, bodyVersion: undefined },
            fetchArtifact: vi.fn().mockResolvedValue({
                id: 'artifact-1',
                header: 'header',
                headerVersion: 4,
                body: 'body',
                bodyVersion: 5,
                dataEncryptionKey: 'wrapped',
                seq: 5,
                createdAt: 10,
                updatedAt: 30,
            }),
            decryptEncryptionKey: vi.fn().mockResolvedValue(null),
            createEncryption: vi.fn(),
            updateArtifact: vi.fn(),
            areArtifactSessionsEqual: () => true,
            assertCurrent: vi.fn(),
            now: () => 30,
        })).rejects.toThrow('Failed to decrypt encryption key');
    });

    it('turns a server version conflict into a refreshable failure', async () => {
        await expect(applyArtifactUpdateRequest({
            artifactId: 'artifact-1',
            title: 'New title',
            body: currentArtifact.body ?? null,
            sessions: currentArtifact.sessions,
            draft: currentArtifact.draft,
            currentArtifact,
            dataEncryptionKey: Uint8Array.from([1]),
            fetchArtifact: vi.fn(),
            decryptEncryptionKey: vi.fn(),
            createEncryption: () => ({
                encryptHeader: vi.fn().mockResolvedValue('header'),
                encryptBody: vi.fn(),
            }),
            updateArtifact: vi.fn().mockResolvedValue({ success: false, error: 'version-mismatch' }),
            areArtifactSessionsEqual: () => true,
            assertCurrent: vi.fn(),
            now: () => 30,
        })).rejects.toThrow('Artifact was modified by another client');
    });
});
