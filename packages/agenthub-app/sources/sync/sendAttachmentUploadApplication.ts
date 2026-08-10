import type { AuthCredentials } from '@/auth/tokenStorage';
import type { AttachmentUploadTarget } from './apiAttachments';
import type { UploadedImageAttachment } from './attachmentMessage';

export type SendImage = {
    data: string;
    mimeType: string;
    name?: string;
    width?: number;
    height?: number;
};

export type UploadImageAttachmentsParams = {
    sessionId: string;
    images: SendImage[];
    credentials: AuthCredentials | null;
    blobKey: Uint8Array | null;
    decodeBase64: (data: string) => Uint8Array;
    encryptBlob: (bytes: Uint8Array, key: Uint8Array) => Uint8Array;
    requestUpload: (
        credentials: AuthCredentials,
        sessionId: string,
        filename: string,
        encryptedSize: number,
    ) => Promise<AttachmentUploadTarget>;
    uploadEncrypted: (
        target: AttachmentUploadTarget,
        bytes: Uint8Array,
        credentials: AuthCredentials,
    ) => Promise<void>;
    logFailure: (message: string) => void;
    isCurrent?: () => boolean;
};

export async function uploadImageAttachments({
    sessionId,
    images,
    credentials,
    blobKey,
    decodeBase64,
    encryptBlob,
    requestUpload,
    uploadEncrypted,
    logFailure,
    isCurrent: isCurrentParam,
}: UploadImageAttachmentsParams): Promise<{ uploaded: UploadedImageAttachment[]; failed: number }> {
    const isCurrent = isCurrentParam ?? (() => true);
    if (!credentials || !blobKey) {
        logFailure(`Upload unavailable for session ${sessionId}: missing credentials or blob key`);
        return { uploaded: [], failed: images.length };
    }

    const uploaded: UploadedImageAttachment[] = [];
    let failed = 0;
    for (const image of images) {
        if (!isCurrent()) return { uploaded, failed };
        try {
            const bytes = decodeBase64(image.data);
            if (bytes.length === 0) throw new Error('Attachment is empty');
            const encrypted = encryptBlob(bytes, blobKey);
            if (!isCurrent()) return { uploaded, failed };
            const target = await requestUpload(
                credentials,
                sessionId,
                image.name ?? 'image',
                encrypted.length,
            );
            if (!isCurrent()) return { uploaded, failed };
            await uploadEncrypted(target, encrypted, credentials);
            if (!isCurrent()) return { uploaded, failed };
            uploaded.push({
                ref: target.ref,
                name: image.name ?? 'image',
                size: bytes.length,
                mimeType: image.mimeType,
                width: image.width,
                height: image.height,
            });
        } catch (error) {
            failed += 1;
            logFailure(error instanceof Error ? error.message : String(error));
        }
    }
    return { uploaded, failed };
}
