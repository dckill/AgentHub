import { describe, expect, it, vi } from 'vitest';
import { cleanupDeletedArtifact } from './artifactDeleteCleanup';

describe('cleanupDeletedArtifact', () => {
    it('removes the decrypted artifact before its data key', () => {
        const calls: string[] = [];
        const deleteArtifact = vi.fn(() => calls.push('artifact'));
        const deleteDataKey = vi.fn(() => calls.push('data-key'));

        cleanupDeletedArtifact('artifact-1', { deleteArtifact, deleteDataKey });

        expect(calls).toEqual(['artifact', 'data-key']);
        expect(deleteArtifact).toHaveBeenCalledWith('artifact-1');
        expect(deleteDataKey).toHaveBeenCalledWith('artifact-1');
    });
});
