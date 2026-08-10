import type { ApiUpdate } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';
import {
    applyArtifactRealtimeUpdate,
    type ArtifactRealtimeApplicationResult,
} from './artifactRealtimeApplication';

type ArtifactUpdate = Extract<ApiUpdate, { t: 'update-artifact' }>;
type ArtifactRealtimeUpdateParams = Parameters<typeof applyArtifactRealtimeUpdate>[0];

export type UpdateArtifactRealtimeHandlerParams = Omit<
    ArtifactRealtimeUpdateParams,
    'onFieldError' | 'onError'
> & {
    invalidateArtifacts: () => void;
    applyArtifact: (artifact: DecryptedArtifact) => void;
    log: (message: string) => void;
    logError: (message: string, error?: unknown) => void;
    applyUpdate?: (params: ArtifactRealtimeUpdateParams) => Promise<ArtifactRealtimeApplicationResult>;
};

/**
 * Apply one realtime update-artifact envelope and own its refreshable side effects.
 * The caller remains responsible for account subscription and storage dependencies.
 */
export async function handleUpdateArtifactRealtime(
    params: UpdateArtifactRealtimeHandlerParams,
): Promise<void> {
    const artifactId = params.update.artifactId;
    params.log('📦 Received update-artifact update');

    const applyUpdate = params.applyUpdate ?? applyArtifactRealtimeUpdate;
    const artifactResult = await applyUpdate({
        artifact: params.artifact,
        dataEncryptionKey: params.dataEncryptionKey,
        update: params.update,
        seq: params.seq,
        updatedAt: params.updatedAt,
        createEncryption: params.createEncryption,
        assertCurrent: params.assertCurrent,
        onFieldError: (field, error) => {
            params.assertCurrent();
            params.logError(`Failed to decrypt artifact ${field} ${artifactId}:`, error);
            params.invalidateArtifacts();
        },
        onError: (error) => {
            params.logError(`Failed to process artifact update ${artifactId}:`, error);
        },
    });

    if (artifactResult.kind === 'missing-artifact') {
        params.logError(`Artifact ${artifactId} not found in storage`);
        params.invalidateArtifacts();
        return;
    }
    if (artifactResult.kind === 'missing-key') {
        params.logError(`Encryption key not found for artifact ${artifactId}, fetching artifacts`);
        params.invalidateArtifacts();
        return;
    }
    if (artifactResult.kind === 'error') {
        params.invalidateArtifacts();
        return;
    }

    params.applyArtifact(artifactResult.artifact);
    params.log(`📦 Updated artifact ${artifactId} in storage`);
}
