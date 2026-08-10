import { describe, expect, it, vi } from 'vitest';
import type { ApiUpdateContainer } from './apiTypes';
import {
    dispatchArtifactRealtimeUpdate,
    type ArtifactRealtimeDispatchContext,
} from './artifactRealtimeDispatch';

const context = (): ArtifactRealtimeDispatchContext => ({
    getArtifact: vi.fn(),
    getDataEncryptionKey: vi.fn(),
    decryptEncryptionKey: vi.fn(),
    storeDataKey: vi.fn(),
    createEncryption: vi.fn(),
    assertCurrent: vi.fn(),
    invalidateArtifacts: vi.fn(),
    addArtifact: vi.fn(),
    applyArtifact: vi.fn(),
    deleteArtifact: vi.fn(),
    deleteDataKey: vi.fn(),
    log: vi.fn(),
    logError: vi.fn(),
});

const envelope = (body: ApiUpdateContainer['body']): ApiUpdateContainer => ({
    id: 'update-1',
    seq: 7,
    createdAt: 100,
    body,
});

describe('artifact realtime dispatch', () => {
    it('routes new, update, and delete artifact envelopes with their metadata', async () => {
        const params = context();
        const newHandler = vi.fn(async () => undefined);
        const updateHandler = vi.fn(async () => undefined);
        const deleteHandler = vi.fn();

        await expect(dispatchArtifactRealtimeUpdate(envelope({
            t: 'new-artifact',
            artifactId: 'artifact-1',
            header: 'header',
            headerVersion: 1,
            dataEncryptionKey: 'key',
            seq: 2,
            createdAt: 10,
            updatedAt: 20,
        }), {
            ...params,
            handleNewArtifact: newHandler,
        })).resolves.toBe(true);
        expect(newHandler).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ artifactId: 'artifact-1' }),
        }));

        await expect(dispatchArtifactRealtimeUpdate(envelope({
            t: 'update-artifact',
            artifactId: 'artifact-1',
            header: { value: 'header', version: 2 },
        }), {
            ...params,
            handleUpdateArtifact: updateHandler,
        })).resolves.toBe(true);
        expect(updateHandler).toHaveBeenCalledWith(expect.objectContaining({
            update: expect.objectContaining({ artifactId: 'artifact-1' }),
            seq: 7,
            updatedAt: 100,
        }));

        await expect(dispatchArtifactRealtimeUpdate(envelope({
            t: 'delete-artifact',
            artifactId: 'artifact-1',
        }), {
            ...params,
            handleDeleteArtifact: deleteHandler,
        })).resolves.toBe(true);
        expect(deleteHandler).toHaveBeenCalledWith(expect.objectContaining({ artifactId: 'artifact-1' }));
    });

    it('returns false without side effects for non-artifact updates', async () => {
        const params = context();

        await expect(dispatchArtifactRealtimeUpdate(envelope({
            t: 'delete-session',
            sid: 'session-1',
        }), params)).resolves.toBe(false);

        expect(params.addArtifact).not.toHaveBeenCalled();
        expect(params.applyArtifact).not.toHaveBeenCalled();
        expect(params.deleteArtifact).not.toHaveBeenCalled();
    });
});
