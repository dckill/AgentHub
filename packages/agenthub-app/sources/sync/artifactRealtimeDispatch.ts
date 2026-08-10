import type { ApiUpdate, ApiUpdateContainer } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';
import {
    handleNewArtifactRealtime,
    type NewArtifactRealtimeHandlerParams,
} from './newArtifactRealtimeHandler';
import {
    handleUpdateArtifactRealtime,
    type UpdateArtifactRealtimeHandlerParams,
} from './updateArtifactRealtimeHandler';
import {
    handleDeleteArtifactRealtime,
    type DeleteArtifactRealtimeHandlerParams,
} from './deleteArtifactRealtimeHandler';

type NewArtifactUpdate = Extract<ApiUpdate, { t: 'new-artifact' }>;
type UpdateArtifactUpdate = Extract<ApiUpdate, { t: 'update-artifact' }>;

export type ArtifactRealtimeDispatchContext = {
    getArtifact: (artifactId: string) => DecryptedArtifact | undefined;
    getDataEncryptionKey: (artifactId: string) => Uint8Array | undefined;
    decryptEncryptionKey: NewArtifactRealtimeHandlerParams['decryptEncryptionKey'];
    storeDataKey: NewArtifactRealtimeHandlerParams['storeDataKey'];
    createEncryption: NewArtifactRealtimeHandlerParams['createEncryption'];
    assertCurrent: NewArtifactRealtimeHandlerParams['assertCurrent'];
    invalidateArtifacts: NewArtifactRealtimeHandlerParams['invalidateArtifacts'];
    addArtifact: NewArtifactRealtimeHandlerParams['addArtifact'];
    applyArtifact: UpdateArtifactRealtimeHandlerParams['applyArtifact'];
    deleteArtifact: DeleteArtifactRealtimeHandlerParams['deleteArtifact'];
    deleteDataKey: DeleteArtifactRealtimeHandlerParams['deleteDataKey'];
    log: NewArtifactRealtimeHandlerParams['log'];
    logError: NewArtifactRealtimeHandlerParams['logError'];
    handleNewArtifact?: typeof handleNewArtifactRealtime;
    handleUpdateArtifact?: typeof handleUpdateArtifactRealtime;
    handleDeleteArtifact?: typeof handleDeleteArtifactRealtime;
};

/**
 * Route artifact envelopes after the account-generation gate has run.
 * The dispatcher owns only branch selection and dependency wiring; each handler
 * remains responsible for decryption, projection, recovery, and logging.
 */
export async function dispatchArtifactRealtimeUpdate(
    envelope: ApiUpdateContainer,
    params: ArtifactRealtimeDispatchContext,
): Promise<boolean> {
    const body = envelope.body;

    if (body.t === 'new-artifact') {
        const handler = params.handleNewArtifact ?? handleNewArtifactRealtime;
        await handler({
            update: body as NewArtifactUpdate,
            decryptEncryptionKey: params.decryptEncryptionKey,
            storeDataKey: params.storeDataKey,
            createEncryption: params.createEncryption,
            assertCurrent: params.assertCurrent,
            invalidateArtifacts: params.invalidateArtifacts,
            addArtifact: params.addArtifact,
            log: params.log,
            logError: params.logError,
        });
        return true;
    }

    if (body.t === 'update-artifact') {
        const artifactId = body.artifactId;
        const handler = params.handleUpdateArtifact ?? handleUpdateArtifactRealtime;
        await handler({
            artifact: params.getArtifact(artifactId),
            dataEncryptionKey: params.getDataEncryptionKey(artifactId),
            update: body as UpdateArtifactUpdate,
            seq: envelope.seq,
            updatedAt: envelope.createdAt,
            createEncryption: params.createEncryption,
            assertCurrent: params.assertCurrent,
            invalidateArtifacts: params.invalidateArtifacts,
            applyArtifact: params.applyArtifact,
            log: params.log,
            logError: params.logError,
        });
        return true;
    }

    if (body.t === 'delete-artifact') {
        const handler = params.handleDeleteArtifact ?? handleDeleteArtifactRealtime;
        handler({
            artifactId: body.artifactId,
            deleteArtifact: params.deleteArtifact,
            deleteDataKey: params.deleteDataKey,
            log: params.log,
        });
        return true;
    }

    return false;
}
