import type { ApiUpdate } from './apiTypes';
import type { DecryptedArtifact } from './artifactTypes';

type ArtifactUpdate = Extract<ApiUpdate, { t: 'update-artifact' }>;

type ArtifactEncryptionLike = {
    decryptHeader: (encrypted: string) => Promise<{
        title: string | null;
        sessions?: string[];
        draft?: boolean;
    } | null>;
    decryptBody: (encrypted: string) => Promise<{ body: string | null } | null>;
};

type ArtifactEncryptedUpdateParams = {
    artifact: DecryptedArtifact;
    update: ArtifactUpdate;
    seq: number;
    updatedAt: number;
    encryption: ArtifactEncryptionLike;
    assertCurrent: () => void;
    onError?: (field: 'header' | 'body', error: unknown) => void;
};

/** Apply encrypted artifact fields while retaining valid local data on failures. */
export async function applyArtifactEncryptedUpdate(
    params: ArtifactEncryptedUpdateParams,
): Promise<DecryptedArtifact> {
    const updated: DecryptedArtifact = {
        ...params.artifact,
        seq: params.seq,
        updatedAt: params.updatedAt,
    };
    const onError = params.onError ?? (() => undefined);

    if (params.update.header) {
        const headerUpdate = params.update.header;
        let header: Awaited<ReturnType<ArtifactEncryptionLike['decryptHeader']>> | undefined;
        try {
            header = await params.encryption.decryptHeader(headerUpdate.value);
        } catch (error) {
            onError('header', error);
            header = undefined;
        }
        if (header === null) {
            onError('header', new Error('Artifact header decryption returned no value'));
        } else if (header !== undefined) {
            params.assertCurrent();
            updated.title = header.title;
            if ('sessions' in header) updated.sessions = header.sessions;
            if ('draft' in header) updated.draft = header.draft;
            updated.headerVersion = headerUpdate.version;
        }
    }

    if (params.update.body) {
        const bodyUpdate = params.update.body;
        let body: Awaited<ReturnType<ArtifactEncryptionLike['decryptBody']>> | undefined;
        try {
            body = await params.encryption.decryptBody(bodyUpdate.value);
        } catch (error) {
            onError('body', error);
            body = undefined;
        }
        if (body === null) {
            onError('body', new Error('Artifact body decryption returned no value'));
        } else if (body !== undefined) {
            params.assertCurrent();
            updated.body = body.body;
            updated.bodyVersion = bodyUpdate.version;
        }
    }

    return updated;
}
