import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';
import { applyArtifactRealtimeUpdate } from './artifactRealtimeApplication';

type ArtifactUpdate = Extract<ApiUpdate, { t: 'update-artifact' }>;

const artifact: DecryptedArtifact = {
    id: 'artifact-1', title: '旧标题', body: '旧正文', headerVersion: 1, bodyVersion: 1,
    seq: 2, createdAt: 1, updatedAt: 1, isDecrypted: true,
};
const update: ArtifactUpdate = {
    t: 'update-artifact', artifactId: 'artifact-1',
    header: { value: 'header', version: 2 }, body: { value: 'body', version: 2 },
};

describe('applyArtifactRealtimeUpdate', () => {
    it('preserves missing-artifact and missing-key classifications', async () => {
        await expect(applyArtifactRealtimeUpdate({
            artifact: undefined,
            dataEncryptionKey: Uint8Array.from([1]),
            update,
            seq: 3,
            updatedAt: 2,
            createEncryption: vi.fn(),
            assertCurrent: vi.fn(),
            onFieldError: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-artifact' });

        await expect(applyArtifactRealtimeUpdate({
            artifact,
            dataEncryptionKey: undefined,
            update,
            seq: 3,
            updatedAt: 2,
            createEncryption: vi.fn(),
            assertCurrent: vi.fn(),
            onFieldError: vi.fn(),
        })).resolves.toEqual({ kind: 'missing-key' });
    });

    it('returns an updated artifact while delegating field failures', async () => {
        const onFieldError = vi.fn();
        const result = await applyArtifactRealtimeUpdate({
            artifact,
            dataEncryptionKey: Uint8Array.from([1]),
            update,
            seq: 3,
            updatedAt: 2,
            createEncryption: () => ({
                decryptHeader: vi.fn().mockResolvedValue({ title: '新标题' }),
                decryptBody: vi.fn().mockRejectedValue(new Error('body failed')),
            }),
            assertCurrent: vi.fn(),
            onFieldError,
        });

        expect(result).toMatchObject({ kind: 'updated', artifact: { title: '新标题', body: '旧正文' } });
        expect(onFieldError).toHaveBeenCalledWith('body', expect.any(Error));
    });

    it('converts an unexpected application exception into a refreshable error', async () => {
        const onError = vi.fn();
        await expect(applyArtifactRealtimeUpdate({
            artifact,
            dataEncryptionKey: Uint8Array.from([1]),
            update,
            seq: 3,
            updatedAt: 2,
            createEncryption: vi.fn().mockImplementation(() => { throw new Error('cipher unavailable'); }),
            assertCurrent: vi.fn(),
            onFieldError: vi.fn(),
            onError,
        })).resolves.toMatchObject({ kind: 'error', error: expect.any(Error) });
        expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
});
