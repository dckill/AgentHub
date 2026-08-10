import type { ApiUpdate } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';
import { applyArtifactEncryptedUpdate } from './artifactEncryptedUpdate';

type ArtifactUpdate = Extract<ApiUpdate, { t: 'update-artifact' }>;

type ArtifactEncryption = {
    decryptHeader: (value: string) => Promise<{
        title: string | null;
        sessions?: string[];
        draft?: boolean;
    } | null>;
    decryptBody: (value: string) => Promise<{ body: string | null } | null>;
};

export type ApplyArtifactUpdateParams = {
    artifact: DecryptedArtifact | undefined;
    dataEncryptionKey: Uint8Array | undefined;
    update: ArtifactUpdate;
    seq: number;
    updatedAt: number;
    createEncryption: (key: Uint8Array) => ArtifactEncryption;
    assertCurrent: () => void;
    onError: (field: 'header' | 'body', error: unknown) => void;
};

export type ApplyArtifactUpdateResult =
    | { kind: 'missing-artifact' }
    | { kind: 'missing-key' }
    | { kind: 'updated'; artifact: DecryptedArtifact };

/** Resolve local prerequisites and apply an encrypted artifact update. */
export async function applyArtifactUpdate(
    params: ApplyArtifactUpdateParams,
): Promise<ApplyArtifactUpdateResult> {
    if (!params.artifact) {
        return { kind: 'missing-artifact' };
    }
    if (!params.dataEncryptionKey) {
        return { kind: 'missing-key' };
    }

    const artifact = await applyArtifactEncryptedUpdate({
        artifact: params.artifact,
        update: params.update,
        seq: params.seq,
        updatedAt: params.updatedAt,
        encryption: params.createEncryption(params.dataEncryptionKey),
        assertCurrent: params.assertCurrent,
        onError: params.onError,
    });

    return { kind: 'updated', artifact };
}
