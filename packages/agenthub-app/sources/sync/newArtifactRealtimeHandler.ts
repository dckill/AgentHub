import type { ApiUpdate } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';
import {
    applyNewArtifactRealtimeUpdate,
    type NewArtifactRealtimeApplicationResult,
} from './newArtifactRealtimeApplication';

type NewArtifactUpdate = Extract<ApiUpdate, { t: 'new-artifact' }>;
type NewArtifactRealtimeUpdateParams = Parameters<typeof applyNewArtifactRealtimeUpdate>[0];

export type NewArtifactRealtimeHandlerParams = Omit<
    NewArtifactRealtimeUpdateParams,
    'onError'
> & {
    invalidateArtifacts: () => void;
    addArtifact: (artifact: DecryptedArtifact) => void;
    log: (message: string) => void;
    logError: (message: string, error?: unknown) => void;
    applyUpdate?: (params: NewArtifactRealtimeUpdateParams) => Promise<NewArtifactRealtimeApplicationResult>;
};

/**
 * Apply one realtime new-artifact envelope and own its refreshable side effects.
 * The caller remains responsible for account subscription and storage dependencies.
 */
export async function handleNewArtifactRealtime(
    params: NewArtifactRealtimeHandlerParams,
): Promise<void> {
    const artifactId = params.update.artifactId;
    params.log('📦 Received new-artifact update');

    const applyUpdate = params.applyUpdate ?? applyNewArtifactRealtimeUpdate;
    const newArtifactResult = await applyUpdate({
        update: params.update,
        decryptEncryptionKey: params.decryptEncryptionKey,
        storeDataKey: params.storeDataKey,
        createEncryption: params.createEncryption,
        assertCurrent: params.assertCurrent,
    });

    if (newArtifactResult.kind === 'missing-key') {
        params.logError(`Failed to decrypt key for new artifact ${artifactId}`);
        params.invalidateArtifacts();
        return;
    }
    if (newArtifactResult.kind === 'undecrypted') {
        params.logError(`Failed to decrypt header for new artifact ${artifactId}`);
        params.invalidateArtifacts();
        return;
    }
    if (newArtifactResult.kind === 'error') {
        params.logError(`Failed to process new artifact ${artifactId}:`, newArtifactResult.error);
        params.invalidateArtifacts();
        return;
    }

    params.addArtifact(newArtifactResult.artifact);
    params.log(`📦 Added new artifact ${artifactId} to storage`);
}
