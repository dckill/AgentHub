import type { Artifact, DecryptedArtifact } from './artifactTypes';
import { projectArtifactPlaintext } from './artifactPlaintext';

type ArtifactHeaderDecryptor = {
    decryptHeader: (value: string) => Promise<{
        title: string | null;
        sessions?: string[];
        draft?: boolean;
    } | null>;
};

export type ArtifactSnapshotApplicationResult = {
    decryptedArtifacts: DecryptedArtifact[];
    artifactKeys: Map<string, Uint8Array>;
    failedArtifactIds: string[];
};

export async function applyArtifactSnapshot(params: {
    artifacts: Artifact[];
    decryptEncryptionKey: (value: string) => Promise<Uint8Array | null>;
    createEncryption: (key: Uint8Array) => ArtifactHeaderDecryptor;
    assertCurrent: () => void;
    onKeyFailure?: (artifactId: string) => void;
    onError?: (artifactId: string, error: unknown) => void;
}): Promise<ArtifactSnapshotApplicationResult> {
    const decryptedArtifacts: DecryptedArtifact[] = [];
    const artifactKeys = new Map<string, Uint8Array>();
    const failedArtifactIds: string[] = [];

    for (const artifact of params.artifacts) {
        try {
            const decryptedKey = await params.decryptEncryptionKey(artifact.dataEncryptionKey);
            params.assertCurrent();
            if (!decryptedKey) {
                params.onKeyFailure?.(artifact.id);
                failedArtifactIds.push(artifact.id);
                continue;
            }

            artifactKeys.set(artifact.id, decryptedKey);
            const header = await params.createEncryption(decryptedKey).decryptHeader(artifact.header);
            params.assertCurrent();
            if (!header) {
                failedArtifactIds.push(artifact.id);
            }

            decryptedArtifacts.push({
                id: artifact.id,
                title: projectArtifactPlaintext(header?.title),
                sessions: header?.sessions,
                draft: header?.draft,
                body: undefined,
                headerVersion: artifact.headerVersion,
                bodyVersion: artifact.bodyVersion,
                seq: artifact.seq,
                createdAt: artifact.createdAt,
                updatedAt: artifact.updatedAt,
                isDecrypted: !!header,
            });
        } catch (error) {
            params.assertCurrent();
            params.onError?.(artifact.id, error);
            failedArtifactIds.push(artifact.id);
            decryptedArtifacts.push({
                id: artifact.id,
                title: null,
                body: undefined,
                headerVersion: artifact.headerVersion,
                bodyVersion: artifact.bodyVersion,
                seq: artifact.seq,
                createdAt: artifact.createdAt,
                updatedAt: artifact.updatedAt,
                isDecrypted: false,
            });
        }
    }

    return { decryptedArtifacts, artifactKeys, failedArtifactIds };
}
