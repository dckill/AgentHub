import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdate } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';
import { handleNewArtifactRealtime } from './newArtifactRealtimeHandler';

type NewArtifactUpdate = Extract<ApiUpdate, { t: 'new-artifact' }>;

const update: NewArtifactUpdate = {
    t: 'new-artifact', artifactId: 'artifact-1', header: 'header', headerVersion: 1,
    body: 'body', bodyVersion: 1, dataEncryptionKey: 'key', seq: 1, createdAt: 1, updatedAt: 1,
};
const artifact: DecryptedArtifact = {
    id: 'artifact-1', title: '标题', body: '正文', headerVersion: 1, bodyVersion: 1,
    seq: 1, createdAt: 1, updatedAt: 1, isDecrypted: true,
};

function createParams(overrides: Record<string, unknown> = {}) {
    return {
        update,
        decryptEncryptionKey: vi.fn(),
        storeDataKey: vi.fn(),
        createEncryption: vi.fn(),
        assertCurrent: vi.fn(),
        invalidateArtifacts: vi.fn(),
        addArtifact: vi.fn(),
        log: vi.fn(),
        logError: vi.fn(),
        applyUpdate: vi.fn().mockResolvedValue({ kind: 'applied', artifact }),
        ...overrides,
    };
}

describe('handleNewArtifactRealtime', () => {
    it('adds a successfully decrypted artifact without invalidating the snapshot', async () => {
        const params = createParams();

        await handleNewArtifactRealtime(params);

        expect(params.addArtifact).toHaveBeenCalledWith(artifact);
        expect(params.invalidateArtifacts).not.toHaveBeenCalled();
        expect(params.log).toHaveBeenCalledWith('📦 Added new artifact artifact-1 to storage');
    });

    it.each([
        ['missing-key', 'Failed to decrypt key for new artifact artifact-1'],
        ['undecrypted', 'Failed to decrypt header for new artifact artifact-1'],
        ['error', undefined],
    ] as const)('refreshes artifacts for %s results', async (kind, expectedLog) => {
        const params = createParams({
            applyUpdate: vi.fn().mockResolvedValue({ kind, ...(kind === 'undecrypted' ? { artifact } : {}), ...(kind === 'error' ? { error: new Error('failed') } : {}) }),
        });

        await handleNewArtifactRealtime(params);

        expect(params.invalidateArtifacts).toHaveBeenCalledOnce();
        expect(params.addArtifact).not.toHaveBeenCalled();
        if (expectedLog) {
            expect(params.logError).toHaveBeenCalledWith(expectedLog);
        }
    });

    it('logs outer application failures while retaining the refresh policy', async () => {
        const params = createParams({
            applyUpdate: vi.fn().mockResolvedValue({ kind: 'error', error: new Error('broken key') }),
        });

        await handleNewArtifactRealtime(params);

        expect(params.logError).toHaveBeenCalledWith('Failed to process new artifact artifact-1:', expect.any(Error));
        expect(params.invalidateArtifacts).toHaveBeenCalledOnce();
    });
});
