import type { DecryptedArtifact } from './artifactTypes';
import {
    applyNewArtifactUpdate,
    type ApplyNewArtifactUpdateParams,
} from './newArtifactUpdateApplication';

export type NewArtifactRealtimeApplicationResult =
    | { kind: 'missing-key' }
    | { kind: 'undecrypted'; artifact: DecryptedArtifact }
    | { kind: 'applied'; artifact: DecryptedArtifact }
    | { kind: 'error'; error: unknown };

/** Apply a realtime artifact creation update and classify refreshable failures. */
export async function applyNewArtifactRealtimeUpdate(
    params: ApplyNewArtifactUpdateParams & { onError?: (error: unknown) => void },
): Promise<NewArtifactRealtimeApplicationResult> {
    try {
        const applied = await applyNewArtifactUpdate(params);
        if (!applied) {
            return { kind: 'missing-key' };
        }
        if (!applied.artifact.isDecrypted) {
            return { kind: 'undecrypted', artifact: applied.artifact };
        }
        return { kind: 'applied', artifact: applied.artifact };
    } catch (error) {
        params.assertCurrent();
        params.onError?.(error);
        return { kind: 'error', error };
    }
}
