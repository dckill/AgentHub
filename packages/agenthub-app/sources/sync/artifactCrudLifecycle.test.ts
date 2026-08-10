import { describe, expect, it, vi } from 'vitest';
import type { AccountRequest } from './accountLifecycle';
import type { DecryptedArtifact } from './artifactTypes';
import {
    runArtifactBodyFetch,
    runArtifactCreate,
    runArtifactUpdate,
} from './artifactCrudLifecycle';

const artifact: DecryptedArtifact = {
    id: 'artifact-1',
    title: 'Draft',
    body: 'body',
    headerVersion: 1,
    bodyVersion: 1,
    seq: 2,
    createdAt: 1,
    updatedAt: 2,
    isDecrypted: true,
};

function runner(): {
    runRequest: <T>(generation: number, operation: (request: AccountRequest) => Promise<T>) => Promise<T>;
    assertCurrent: ReturnType<typeof vi.fn>;
} {
    const assertCurrent = vi.fn();
    const runRequest = async <T>(_generation: number, operation: (request: AccountRequest) => Promise<T>) => operation({
        signal: new AbortController().signal,
        assertCurrent,
    });
    return { runRequest, assertCurrent };
}

describe('artifact CRUD lifecycle', () => {
    it('persists the decrypted key only after a current full-artifact fetch', async () => {
        const { runRequest, assertCurrent } = runner();
        const setDataKey = vi.fn();
        const result = await runArtifactBodyFetch({
            generation: 4,
            runRequest,
            fetchArtifact: vi.fn().mockResolvedValue({ id: 'artifact-1' }),
            applyBody: vi.fn().mockImplementation(async (_raw, current) => {
                current();
                return { artifact, decryptedKey: new Uint8Array([1, 2, 3]) };
            }),
            setDataKey,
            assertCurrent,
        });

        expect(result).toBe(artifact);
        expect(setDataKey).toHaveBeenCalledWith('artifact-1', new Uint8Array([1, 2, 3]));
        expect(assertCurrent).toHaveBeenCalled();
    });

    it('applies create result to the key registry and storage after the request', async () => {
        const { runRequest, assertCurrent } = runner();
        const setDataKey = vi.fn();
        const addArtifact = vi.fn();
        const result = await runArtifactCreate({
            generation: 2,
            runRequest,
            applyCreate: vi.fn().mockResolvedValue({
                artifactId: 'artifact-2',
                dataEncryptionKey: new Uint8Array([9]),
                decryptedArtifact: artifact,
            }),
            setDataKey,
            addArtifact,
            assertCurrent,
        });

        expect(result).toBe('artifact-2');
        expect(setDataKey).toHaveBeenCalledWith('artifact-2', new Uint8Array([9]));
        expect(addArtifact).toHaveBeenCalledWith(artifact);
    });

    it('does not project a no-op update, but projects a successful update once', async () => {
        const { runRequest, assertCurrent } = runner();
        const setDataKey = vi.fn();
        const updateArtifact = vi.fn();
        await runArtifactUpdate({
            generation: 3,
            runRequest,
            applyUpdate: vi.fn().mockResolvedValue(null),
            setDataKey,
            updateArtifact,
            assertCurrent,
        });
        expect(updateArtifact).not.toHaveBeenCalled();

        await runArtifactUpdate({
            generation: 3,
            runRequest,
            applyUpdate: vi.fn().mockResolvedValue({
                dataEncryptionKey: new Uint8Array([7]),
                updatedArtifact: artifact,
            }),
            setDataKey,
            updateArtifact,
            assertCurrent,
        });
        expect(setDataKey).toHaveBeenCalledWith('artifact-1', new Uint8Array([7]));
        expect(updateArtifact).toHaveBeenCalledWith(artifact);
    });
});
