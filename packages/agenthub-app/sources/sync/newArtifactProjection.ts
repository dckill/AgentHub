import { projectArtifactPlaintext } from './artifactPlaintext';
import type { ArtifactHeader, DecryptedArtifact } from './artifactTypes';
import type { ApiUpdate } from './apiTypes';

type NewArtifactUpdate = Extract<ApiUpdate, { t: 'new-artifact' }>;

/** Build a decrypted artifact from a realtime creation update without dropping header flags. */
export function buildNewArtifactProjection(
    update: NewArtifactUpdate,
    header: ArtifactHeader | null,
    body: string | null | undefined,
): DecryptedArtifact {
    return {
        id: update.artifactId,
        title: projectArtifactPlaintext(header?.title),
        sessions: header?.sessions,
        draft: header?.draft,
        body,
        headerVersion: update.headerVersion,
        bodyVersion: update.bodyVersion,
        seq: update.seq,
        createdAt: update.createdAt,
        updatedAt: update.updatedAt,
        isDecrypted: Boolean(header),
    };
}
