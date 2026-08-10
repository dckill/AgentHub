import type { ArtifactSnapshotApplicationResult } from './artifactSnapshotApplication';

/** Apply a decrypted artifact list and preserve retry semantics for partial snapshots. */
export async function applyArtifactListSync(params: {
    load: () => Promise<ArtifactSnapshotApplicationResult>;
    /** Guard the account generation before mutating keys or storage. */
    assertCurrent?: () => void;
    setDataKey: (artifactId: string, key: Uint8Array) => void;
    applyArtifacts: (artifacts: ArtifactSnapshotApplicationResult['decryptedArtifacts']) => void;
    scheduleRetry: () => void;
}): Promise<ArtifactSnapshotApplicationResult> {
    const result = await params.load();
    params.assertCurrent?.();

    for (const [artifactId, key] of result.artifactKeys) {
        params.setDataKey(artifactId, key);
    }

    params.applyArtifacts(result.decryptedArtifacts);
    if (result.failedArtifactIds.length > 0) {
        params.scheduleRetry();
    }

    return result;
}
