import type { RawRecord } from './typesRaw';

export type UploadedImageAttachment = {
    ref: string;
    name: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
};

export function createAttachmentFileRecord(
    attachment: UploadedImageAttachment,
    id: string,
    time: number,
): RawRecord {
    return {
        role: 'session',
        content: {
            type: 'session',
            data: {
                id,
                time,
                role: 'user',
                ev: {
                    t: 'file',
                    ref: attachment.ref,
                    name: attachment.name,
                    size: attachment.size,
                    mimeType: attachment.mimeType,
                    ...(attachment.width && attachment.height
                        ? { image: { width: attachment.width, height: attachment.height } }
                        : {}),
                },
            },
        },
    };
}
