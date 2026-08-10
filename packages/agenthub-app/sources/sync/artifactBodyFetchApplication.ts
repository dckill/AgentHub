import type { Artifact, DecryptedArtifact } from './artifactTypes';
import { projectArtifactPlaintext } from './artifactPlaintext';

type ArtifactBodyEncryption = {
    decryptHeader: (value: string) => Promise<{
        title: string | null;
        sessions?: string[];
        draft?: boolean;
    } | null>;
    decryptBody: (value: string) => Promise<{ body: string | null } | null>;
};

export type ArtifactBodyFetchApplicationResult = {
    artifact: DecryptedArtifact;
    decryptedKey: Uint8Array;
};

/** Apply the full-artifact decryption boundary after the API response is fetched. */
export async function applyArtifactBodyFetch(params: {
    artifact: Artifact;
    decryptEncryptionKey: (value: string) => Promise<Uint8Array | null>;
    createEncryption: (key: Uint8Array) => ArtifactBodyEncryption;
    assertCurrent: () => void;
}): Promise<ArtifactBodyFetchApplicationResult> {
    const decryptedKey = await params.decryptEncryptionKey(params.artifact.dataEncryptionKey);
    params.assertCurrent();
    if (!decryptedKey) {
        throw new Error(`Failed to decrypt key for artifact ${params.artifact.id}`);
    }

    const encryption = params.createEncryption(decryptedKey);
    const header = await encryption.decryptHeader(params.artifact.header);
    const body = params.artifact.body ? await encryption.decryptBody(params.artifact.body) : null;
    params.assertCurrent();
    if (!header) {
        throw new Error(`Failed to decrypt header for artifact ${params.artifact.id}`);
    }
    if (params.artifact.body && !body) {
        throw new Error(`Failed to decrypt body for artifact ${params.artifact.id}`);
    }

    return {
        artifact: {
            id: params.artifact.id,
            title: projectArtifactPlaintext(header.title),
            sessions: header.sessions,
            draft: header.draft,
            body: projectArtifactPlaintext(body?.body),
            headerVersion: params.artifact.headerVersion,
            bodyVersion: params.artifact.bodyVersion,
            seq: params.artifact.seq,
            createdAt: params.artifact.createdAt,
            updatedAt: params.artifact.updatedAt,
            isDecrypted: true,
        } satisfies DecryptedArtifact,
        decryptedKey,
    };
}
