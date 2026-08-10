import type { ApiUpdate } from './apiTypes';
import type { ArtifactBody, ArtifactHeader, DecryptedArtifact } from './artifactTypes';
import { projectArtifactPlaintext } from './artifactPlaintext';
import { buildNewArtifactProjection } from './newArtifactProjection';

type NewArtifactUpdate = Extract<ApiUpdate, { t: 'new-artifact' }>;

export type NewArtifactEncryption = {
    decryptHeader: (value: string) => Promise<ArtifactHeader | null>;
    decryptBody: (value: string) => Promise<ArtifactBody | null>;
};

export type ApplyNewArtifactUpdateParams = {
    update: NewArtifactUpdate;
    decryptEncryptionKey: (value: string) => Promise<Uint8Array | null>;
    storeDataKey: (artifactId: string, key: Uint8Array) => void;
    createEncryption: (key: Uint8Array) => NewArtifactEncryption;
    assertCurrent: () => void;
};

export type AppliedNewArtifactUpdate = {
    dataEncryptionKey: Uint8Array;
    artifact: DecryptedArtifact;
};

/**
 * Decrypt and project a realtime artifact creation update. Storage and refresh
 * policy stay outside this boundary so callers can keep their failure policy.
 */
export async function applyNewArtifactUpdate(
    params: ApplyNewArtifactUpdateParams,
): Promise<AppliedNewArtifactUpdate | null> {
    const dataEncryptionKey = await params.decryptEncryptionKey(params.update.dataEncryptionKey);
    params.assertCurrent();
    if (!dataEncryptionKey) {
        return null;
    }

    params.storeDataKey(params.update.artifactId, dataEncryptionKey);
    const encryption = params.createEncryption(dataEncryptionKey);

    const header = await encryption.decryptHeader(params.update.header);
    params.assertCurrent();

    let decryptedBody: string | null | undefined;
    let bodyDecryptionFailed = false;
    if (params.update.body && params.update.bodyVersion !== undefined) {
        const body = await encryption.decryptBody(params.update.body);
        params.assertCurrent();
        if (!body) {
            bodyDecryptionFailed = true;
        } else {
            decryptedBody = projectArtifactPlaintext(body.body);
        }
    }

    const artifact = buildNewArtifactProjection(params.update, header, decryptedBody);
    if (bodyDecryptionFailed) {
        artifact.isDecrypted = false;
    }

    return {
        dataEncryptionKey,
        artifact,
    };
}
