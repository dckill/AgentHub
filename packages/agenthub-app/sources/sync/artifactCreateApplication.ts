import { encodeBase64 } from '../encryption/base64';
import type { Artifact, ArtifactCreateRequest, DecryptedArtifact } from './artifactTypes';

type ArtifactCreateEncryption = {
    encryptHeader: (value: {
        title: string | null;
        sessions?: string[];
        draft?: boolean;
    }) => Promise<string>;
    encryptBody: (value: { body: string | null }) => Promise<string>;
};

export type ArtifactCreateApplicationResult = {
    artifactId: string;
    dataEncryptionKey: Uint8Array;
    decryptedArtifact: DecryptedArtifact;
};

/** Apply artifact encryption, API creation and the successful local projection. */
export async function applyArtifactCreate(params: {
    title: string | null;
    body: string | null;
    sessions?: string[];
    draft?: boolean;
    generateId: () => string;
    generateDataEncryptionKey: () => Uint8Array;
    encryptEncryptionKey: (value: Uint8Array) => Promise<Uint8Array>;
    createEncryption: (key: Uint8Array) => ArtifactCreateEncryption;
    createArtifact: (request: ArtifactCreateRequest) => Promise<Artifact>;
    assertCurrent: () => void;
}): Promise<ArtifactCreateApplicationResult> {
    const artifactId = params.generateId();
    const dataEncryptionKey = params.generateDataEncryptionKey();
    const encryptedKey = await params.encryptEncryptionKey(dataEncryptionKey);
    params.assertCurrent();

    const encryption = params.createEncryption(dataEncryptionKey);
    const encryptedHeader = await encryption.encryptHeader({
        title: params.title,
        sessions: params.sessions,
        draft: params.draft,
    });
    const encryptedBody = await encryption.encryptBody({ body: params.body });
    params.assertCurrent();

    const artifact = await params.createArtifact({
        id: artifactId,
        header: encryptedHeader,
        body: encryptedBody,
        dataEncryptionKey: encodeBase64(encryptedKey, 'base64'),
    });

    return {
        artifactId,
        dataEncryptionKey,
        decryptedArtifact: {
            id: artifact.id,
            title: params.title,
            sessions: params.sessions,
            draft: params.draft,
            body: params.body,
            headerVersion: artifact.headerVersion,
            bodyVersion: artifact.bodyVersion,
            seq: artifact.seq,
            createdAt: artifact.createdAt,
            updatedAt: artifact.updatedAt,
            isDecrypted: true,
        } satisfies DecryptedArtifact,
    };
}
