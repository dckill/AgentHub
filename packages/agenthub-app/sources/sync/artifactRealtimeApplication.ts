import {
    applyArtifactUpdate,
    type ApplyArtifactUpdateParams,
    type ApplyArtifactUpdateResult,
} from './artifactUpdateApplication';

export type ArtifactRealtimeApplicationResult =
    | ApplyArtifactUpdateResult
    | { kind: 'error'; error: unknown };

/** Apply a realtime artifact update and classify refreshable outer failures. */
export async function applyArtifactRealtimeUpdate(
    params: Omit<ApplyArtifactUpdateParams, 'onError'> & {
        onFieldError: ApplyArtifactUpdateParams['onError'];
        onError?: (error: unknown) => void;
    },
): Promise<ArtifactRealtimeApplicationResult> {
    try {
        return await applyArtifactUpdate({
            artifact: params.artifact,
            dataEncryptionKey: params.dataEncryptionKey,
            update: params.update,
            seq: params.seq,
            updatedAt: params.updatedAt,
            createEncryption: params.createEncryption,
            assertCurrent: params.assertCurrent,
            onError: params.onFieldError,
        });
    } catch (error) {
        params.assertCurrent();
        params.onError?.(error);
        return { kind: 'error', error };
    }
}
