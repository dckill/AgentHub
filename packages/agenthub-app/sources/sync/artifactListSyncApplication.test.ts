import { describe, expect, it, vi } from 'vitest';
import { applyArtifactListSync } from './artifactListSyncApplication';

describe('applyArtifactListSync', () => {
    it('registers keys and applies the decrypted snapshot without scheduling a retry', async () => {
        const setDataKey = vi.fn();
        const applyArtifacts = vi.fn();
        const scheduleRetry = vi.fn();
        const decryptedArtifacts = [{
            id: 'artifact-1',
            title: 'Notes',
            headerVersion: 1,
            seq: 2,
            createdAt: 10,
            updatedAt: 20,
            isDecrypted: true,
        }];
        const key = new Uint8Array([1, 2, 3]);

        const result = await applyArtifactListSync({
            load: async () => ({
                decryptedArtifacts,
                artifactKeys: new Map([['artifact-1', key]]),
                failedArtifactIds: [],
            }),
            setDataKey,
            applyArtifacts,
            scheduleRetry,
        });

        expect(result.decryptedArtifacts).toEqual(decryptedArtifacts);
        expect(setDataKey).toHaveBeenCalledWith('artifact-1', key);
        expect(applyArtifacts).toHaveBeenCalledWith(decryptedArtifacts);
        expect(scheduleRetry).not.toHaveBeenCalled();
    });

    it('keeps the partial projection visible and schedules a retry after key failures', async () => {
        const applyArtifacts = vi.fn();
        const scheduleRetry = vi.fn();
        const decryptedArtifacts = [{
            id: 'artifact-2',
            title: null,
            headerVersion: 1,
            seq: 3,
            createdAt: 10,
            updatedAt: 20,
            isDecrypted: false,
        }];

        await applyArtifactListSync({
            load: async () => ({
                decryptedArtifacts,
                artifactKeys: new Map(),
                failedArtifactIds: ['artifact-2'],
            }),
            setDataKey: vi.fn(),
            applyArtifacts,
            scheduleRetry,
        });

        expect(applyArtifacts).toHaveBeenCalledWith(decryptedArtifacts);
        expect(scheduleRetry).toHaveBeenCalledTimes(1);
    });

    it('does not mutate keys or storage when the account generation becomes stale', async () => {
        const setDataKey = vi.fn();
        const applyArtifacts = vi.fn();
        const scheduleRetry = vi.fn();
        const assertCurrent = vi.fn(() => {
            throw new DOMException('Account lifecycle is stale', 'AbortError');
        });

        await expect(applyArtifactListSync({
            load: async () => ({
                decryptedArtifacts: [],
                artifactKeys: new Map([['artifact-1', new Uint8Array([1])]]),
                failedArtifactIds: [],
            }),
            assertCurrent,
            setDataKey,
            applyArtifacts,
            scheduleRetry,
        })).rejects.toMatchObject({ name: 'AbortError' });

        expect(setDataKey).not.toHaveBeenCalled();
        expect(applyArtifacts).not.toHaveBeenCalled();
        expect(scheduleRetry).not.toHaveBeenCalled();
    });
});
