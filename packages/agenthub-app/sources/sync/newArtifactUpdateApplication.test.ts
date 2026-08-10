import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import { applyNewArtifactUpdate } from './newArtifactUpdateApplication';

type NewArtifactUpdate = Extract<ApiUpdate, { t: 'new-artifact' }>;

const update: NewArtifactUpdate = {
    t: 'new-artifact',
    artifactId: 'artifact-1',
    header: 'encrypted-header',
    headerVersion: 2,
    body: 'encrypted-body',
    bodyVersion: 3,
    dataEncryptionKey: 'encrypted-key',
    seq: 4,
    createdAt: 10,
    updatedAt: 11,
};

describe('applyNewArtifactUpdate', () => {
    it('decrypts the key, header, and body before building the artifact projection', async () => {
        const assertCurrent = vi.fn();
        const storeDataKey = vi.fn();
        const encryption = {
            decryptHeader: vi.fn().mockResolvedValue({ title: '标题', sessions: ['session-1'], draft: true }),
            decryptBody: vi.fn().mockResolvedValue({ body: '正文' }),
        };

        await expect(applyNewArtifactUpdate({
            update,
            decryptEncryptionKey: async () => Uint8Array.from([1, 2, 3]),
            storeDataKey,
            createEncryption: () => encryption,
            assertCurrent,
        })).resolves.toEqual({
            dataEncryptionKey: Uint8Array.from([1, 2, 3]),
            artifact: expect.objectContaining({
                id: 'artifact-1',
                title: '标题',
                sessions: ['session-1'],
                draft: true,
                body: '正文',
                isDecrypted: true,
            }),
        });

        expect(storeDataKey).toHaveBeenCalledWith('artifact-1', Uint8Array.from([1, 2, 3]));
        expect(encryption.decryptHeader).toHaveBeenCalledWith('encrypted-header');
        expect(encryption.decryptBody).toHaveBeenCalledWith('encrypted-body');
        expect(assertCurrent).toHaveBeenCalledTimes(3);
    });

    it('returns null when the encrypted data key cannot be recovered', async () => {
        const storeDataKey = vi.fn();

        await expect(applyNewArtifactUpdate({
            update,
            decryptEncryptionKey: async () => null,
            storeDataKey,
            createEncryption: vi.fn(),
            assertCurrent: vi.fn(),
        })).resolves.toBeNull();

        expect(storeDataKey).not.toHaveBeenCalled();
        expect(update.body).toBeDefined();
    });

    it('does not decrypt an absent body while preserving an empty decrypted title', async () => {
        const noBodyUpdate = { ...update, body: undefined, bodyVersion: undefined };
        const encryption = {
            decryptHeader: vi.fn().mockResolvedValue({ title: '' }),
            decryptBody: vi.fn(),
        };

        const result = await applyNewArtifactUpdate({
            update: noBodyUpdate,
            decryptEncryptionKey: async () => Uint8Array.from([9]),
            storeDataKey: vi.fn(),
            createEncryption: () => encryption,
            assertCurrent: vi.fn(),
        });

        expect(result?.artifact.title).toBe('');
        expect(result?.artifact.body).toBeUndefined();
        expect(encryption.decryptBody).not.toHaveBeenCalled();
    });

    it('marks a present body as undecrypted when body decryption returns no payload', async () => {
        const encryption = {
            decryptHeader: vi.fn().mockResolvedValue({ title: '标题' }),
            decryptBody: vi.fn().mockResolvedValue(null),
        };

        const result = await applyNewArtifactUpdate({
            update,
            decryptEncryptionKey: async () => Uint8Array.from([9]),
            storeDataKey: vi.fn(),
            createEncryption: () => encryption,
            assertCurrent: vi.fn(),
        });

        expect(result?.artifact.isDecrypted).toBe(false);
        expect(result?.artifact.body).toBeUndefined();
    });
});
