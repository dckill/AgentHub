import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';
import { handleUpdateArtifactRealtime } from './updateArtifactRealtimeHandler';

type ArtifactUpdate = Extract<ApiUpdate, { t: 'update-artifact' }>;

const artifact: DecryptedArtifact = {
    id: 'artifact-1', title: '旧标题', body: '旧正文', headerVersion: 1, bodyVersion: 1,
    seq: 2, createdAt: 1, updatedAt: 1, isDecrypted: true,
};
const update: ArtifactUpdate = {
    t: 'update-artifact', artifactId: 'artifact-1',
};

function createParams(overrides: Record<string, unknown> = {}) {
    return {
        artifact,
        dataEncryptionKey: Uint8Array.from([1]),
        update,
        seq: 3,
        updatedAt: 2,
        createEncryption: vi.fn(),
        assertCurrent: vi.fn(),
        invalidateArtifacts: vi.fn(),
        applyArtifact: vi.fn(),
        log: vi.fn(),
        logError: vi.fn(),
        applyUpdate: vi.fn().mockResolvedValue({
            kind: 'updated',
            artifact,
        }),
        ...overrides,
    };
}

describe('handleUpdateArtifactRealtime', () => {
    it('applies an updated artifact without invalidating the snapshot', async () => {
        const params = createParams();

        await handleUpdateArtifactRealtime(params);

        expect(params.applyArtifact).toHaveBeenCalledWith(artifact);
        expect(params.invalidateArtifacts).not.toHaveBeenCalled();
        expect(params.log).toHaveBeenCalledWith('📦 Updated artifact artifact-1 in storage');
    });

    it.each([
        ['missing-artifact', 'Artifact artifact-1 not found in storage'],
        ['missing-key', 'Encryption key not found for artifact artifact-1, fetching artifacts'],
        ['error', undefined],
    ] as const)('invalidates artifacts for %s results', async (kind, expectedLog) => {
        const params = createParams({
            applyUpdate: vi.fn().mockResolvedValue({ kind, ...(kind === 'error' ? { error: new Error('failed') } : {}) }),
        });

        await handleUpdateArtifactRealtime(params);

        expect(params.invalidateArtifacts).toHaveBeenCalledOnce();
        expect(params.applyArtifact).not.toHaveBeenCalled();
        if (expectedLog) {
            expect(params.logError).toHaveBeenCalledWith(expectedLog);
        }
    });

    it('re-checks the current account before handling field decryption failures', async () => {
        const params = createParams({
            applyUpdate: vi.fn().mockImplementation(async (input) => {
                input.onFieldError('body', new Error('body failed'));
                return { kind: 'updated', artifact };
            }),
        });

        await handleUpdateArtifactRealtime(params);

        expect(params.assertCurrent).toHaveBeenCalledOnce();
        expect(params.invalidateArtifacts).toHaveBeenCalledOnce();
        expect(params.logError).toHaveBeenCalledWith('Failed to decrypt artifact body artifact-1:', expect.any(Error));
    });
});
