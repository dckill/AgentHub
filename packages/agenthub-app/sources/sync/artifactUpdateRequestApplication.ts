import type {
    Artifact,
    ArtifactUpdateRequest,
    ArtifactUpdateResponse,
    DecryptedArtifact,
} from './artifactTypes';

type ArtifactUpdateEncryption = {
    encryptHeader: (value: {
        title: string | null;
        sessions?: string[];
        draft?: boolean;
    }) => Promise<string>;
    encryptBody: (value: { body: string | null }) => Promise<string>;
};

export type ArtifactUpdateRequestApplicationResult = {
    dataEncryptionKey: Uint8Array;
    updatedArtifact: DecryptedArtifact;
};

/** Apply artifact version resolution, encrypted update construction and local projection. */
export async function applyArtifactUpdateRequest(params: {
    artifactId: string;
    title: string | null;
    body: string | null;
    sessions?: string[];
    draft?: boolean;
    currentArtifact: DecryptedArtifact;
    dataEncryptionKey?: Uint8Array;
    fetchArtifact: () => Promise<Artifact>;
    decryptEncryptionKey: (value: string) => Promise<Uint8Array | null>;
    createEncryption: (key: Uint8Array) => ArtifactUpdateEncryption;
    updateArtifact: (request: ArtifactUpdateRequest) => Promise<ArtifactUpdateResponse>;
    areArtifactSessionsEqual: (left: string[] | undefined, right: string[] | undefined) => boolean;
    assertCurrent: () => void;
    now: () => number;
}): Promise<ArtifactUpdateRequestApplicationResult | null> {
    let dataEncryptionKey = params.dataEncryptionKey;
    let headerVersion = params.currentArtifact.headerVersion;
    let bodyVersion = params.currentArtifact.bodyVersion;

    if (headerVersion === undefined || bodyVersion === undefined || !dataEncryptionKey) {
        const fullArtifact = await params.fetchArtifact();
        params.assertCurrent();
        headerVersion = fullArtifact.headerVersion;
        bodyVersion = fullArtifact.bodyVersion;
        if (!dataEncryptionKey) {
            const decryptedKey = await params.decryptEncryptionKey(fullArtifact.dataEncryptionKey);
            params.assertCurrent();
            if (!decryptedKey) {
                throw new Error('Failed to decrypt encryption key');
            }
            dataEncryptionKey = decryptedKey;
        }
    }

    if (!dataEncryptionKey) {
        throw new Error('Failed to resolve encryption key');
    }

    const encryption = params.createEncryption(dataEncryptionKey);
    const updateRequest: ArtifactUpdateRequest = {};
    if (
        params.title !== params.currentArtifact.title ||
        !params.areArtifactSessionsEqual(params.sessions, params.currentArtifact.sessions) ||
        params.draft !== params.currentArtifact.draft
    ) {
        updateRequest.header = await encryption.encryptHeader({
            title: params.title,
            sessions: params.sessions,
            draft: params.draft,
        });
        updateRequest.expectedHeaderVersion = headerVersion;
    }
    if (params.body !== params.currentArtifact.body) {
        updateRequest.body = await encryption.encryptBody({ body: params.body });
        updateRequest.expectedBodyVersion = bodyVersion;
    }
    params.assertCurrent();
    if (Object.keys(updateRequest).length === 0) {
        return null;
    }

    const response = await params.updateArtifact(updateRequest);
    if (!response.success) {
        if (response.error === 'version-mismatch') {
            throw new Error('Artifact was modified by another client. Please refresh and try again.');
        }
        throw new Error('Failed to update artifact');
    }

    return {
        dataEncryptionKey,
        updatedArtifact: {
            ...params.currentArtifact,
            title: params.title,
            sessions: params.sessions,
            draft: params.draft,
            body: params.body,
            headerVersion: response.headerVersion !== undefined ? response.headerVersion : headerVersion,
            bodyVersion: response.bodyVersion !== undefined ? response.bodyVersion : bodyVersion,
            updatedAt: params.now(),
        } satisfies DecryptedArtifact,
    };
}
