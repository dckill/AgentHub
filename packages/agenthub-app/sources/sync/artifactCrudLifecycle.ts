import type { AccountRequest } from './accountLifecycle';
import type { Artifact, DecryptedArtifact } from './artifactTypes';

export type ArtifactAccountRequestRunner = <T>(
    generation: number,
    operation: (request: AccountRequest) => Promise<T>,
) => Promise<T>;

type ArtifactBodyFetchResult = {
    artifact: DecryptedArtifact;
    decryptedKey: Uint8Array;
};

type ArtifactCreateResult = {
    artifactId: string;
    dataEncryptionKey: Uint8Array;
    decryptedArtifact: DecryptedArtifact;
};

type ArtifactUpdateResult = {
    dataEncryptionKey: Uint8Array;
    updatedArtifact: DecryptedArtifact;
};

/** Keep account generation, key registry and storage projection together for a full fetch. */
export async function runArtifactBodyFetch(params: {
    generation: number;
    runRequest: ArtifactAccountRequestRunner;
    fetchArtifact: (signal: AbortSignal) => Promise<Artifact>;
    applyBody: (artifact: Artifact, assertCurrent: () => void) => Promise<ArtifactBodyFetchResult>;
    assertCurrent: () => void;
    setDataKey: (artifactId: string, key: Uint8Array) => void;
}): Promise<DecryptedArtifact> {
    const result = await params.runRequest(params.generation, async (request) => {
        const artifact = await params.fetchArtifact(request.signal);
        request.assertCurrent();
        return params.applyBody(artifact, request.assertCurrent);
    });
    params.assertCurrent();
    params.setDataKey(result.artifact.id, result.decryptedKey);
    return result.artifact;
}

/** Keep account generation, key registry and storage projection together for creation. */
export async function runArtifactCreate(params: {
    generation: number;
    runRequest: ArtifactAccountRequestRunner;
    applyCreate: (request: AccountRequest) => Promise<ArtifactCreateResult>;
    assertCurrent: () => void;
    setDataKey: (artifactId: string, key: Uint8Array) => void;
    addArtifact: (artifact: DecryptedArtifact) => void;
}): Promise<string> {
    const result = await params.runRequest(params.generation, params.applyCreate);
    params.assertCurrent();
    params.setDataKey(result.artifactId, result.dataEncryptionKey);
    params.addArtifact(result.decryptedArtifact);
    return result.artifactId;
}

/** Keep no-op updates side-effect free and project successful updates exactly once. */
export async function runArtifactUpdate(params: {
    generation: number;
    runRequest: ArtifactAccountRequestRunner;
    applyUpdate: (request: AccountRequest) => Promise<ArtifactUpdateResult | null>;
    assertCurrent: () => void;
    setDataKey: (artifactId: string, key: Uint8Array) => void;
    updateArtifact: (artifact: DecryptedArtifact) => void;
}): Promise<boolean> {
    const result = await params.runRequest(params.generation, params.applyUpdate);
    if (!result) {
        return false;
    }
    params.assertCurrent();
    params.setDataKey(result.updatedArtifact.id, result.dataEncryptionKey);
    params.updateArtifact(result.updatedArtifact);
    return true;
}
