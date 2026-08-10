import { applyArtifactDeleteRealtimeUpdate } from './resourceDeleteRealtimeApplication';
import type { ArtifactDeleteCleanup } from './artifactDeleteCleanup';

export type DeleteArtifactRealtimeHandlerParams = ArtifactDeleteCleanup & {
    artifactId: string;
    log: (message: string) => void;
    applyDelete?: (artifactId: string, cleanup: ArtifactDeleteCleanup) => void;
};

/** Apply one realtime delete-artifact envelope and own its receipt log. */
export function handleDeleteArtifactRealtime(
    params: DeleteArtifactRealtimeHandlerParams,
): void {
    const applyDelete = params.applyDelete ?? applyArtifactDeleteRealtimeUpdate;
    const {
        artifactId,
        log,
        applyDelete: _injectedApplyDelete,
        ...cleanup
    } = params;

    log('📦 Received delete-artifact update');
    applyDelete(artifactId, cleanup);
}
