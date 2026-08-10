import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import { applyNewArtifactRealtimeUpdate } from './newArtifactRealtimeApplication';

type NewArtifactUpdate = Extract<ApiUpdate, { t: 'new-artifact' }>;

const update: NewArtifactUpdate = {
    t: 'new-artifact', artifactId: 'artifact-1', header: 'header', headerVersion: 1,
    body: 'body', bodyVersion: 1, dataEncryptionKey: 'key', seq: 1, createdAt: 1, updatedAt: 1,
};

describe('applyNewArtifactRealtimeUpdate', () => {
    it('classifies an unrecoverable data key without storing an artifact', async () => {
        await expect(applyNewArtifactRealtimeUpdate({
            update,
            decryptEncryptionKey: vi.fn().mockResolvedValue(null),
            storeDataKey: vi.fn(),
            createEncryption: vi.fn(),
            assertCurrent: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-key' });
    });

    it('classifies a successful decrypted artifact', async () => {
        await expect(applyNewArtifactRealtimeUpdate({
            update,
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([1])),
            storeDataKey: vi.fn(),
            createEncryption: () => ({
                decryptHeader: vi.fn().mockResolvedValue({ title: '标题' }),
                decryptBody: vi.fn().mockResolvedValue({ body: '正文' }),
            }),
            assertCurrent: vi.fn(),
        })).resolves.toMatchObject({ kind: 'applied', artifact: { title: '标题', body: '正文' } });
    });

    it('keeps a present body decryption miss fail-closed', async () => {
        await expect(applyNewArtifactRealtimeUpdate({
            update,
            decryptEncryptionKey: vi.fn().mockResolvedValue(Uint8Array.from([1])),
            storeDataKey: vi.fn(),
            createEncryption: () => ({
                decryptHeader: vi.fn().mockResolvedValue({ title: '标题' }),
                decryptBody: vi.fn().mockResolvedValue(null),
            }),
            assertCurrent: vi.fn(),
        })).resolves.toMatchObject({ kind: 'undecrypted' });
    });

    it('converts an application exception into a refreshable error result', async () => {
        const onError = vi.fn();
        await expect(applyNewArtifactRealtimeUpdate({
            update,
            decryptEncryptionKey: vi.fn().mockRejectedValue(new Error('broken key')),
            storeDataKey: vi.fn(),
            createEncryption: vi.fn(),
            assertCurrent: vi.fn(),
            onError,
        })).resolves.toMatchObject({ kind: 'error', error: expect.any(Error) });
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
});
