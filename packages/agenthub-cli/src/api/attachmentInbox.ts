import type { UserMessage } from './types';

export type IncomingAttachmentDescriptor = {
    ref: string;
    name: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
};

export type DecodedIncomingImage = Omit<IncomingAttachmentDescriptor, 'ref' | 'size'> & { data: Uint8Array };

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parseIncomingImageAttachment(value: unknown): IncomingAttachmentDescriptor | null {
    const root = record(value);
    const content = record(root?.content);
    const data = record(content?.data);
    const event = record(data?.ev);
    if (root?.role !== 'session' || content?.type !== 'session' || data?.role !== 'user' || event?.t !== 'file') return null;
    if (typeof event.ref !== 'string' || typeof event.name !== 'string' || typeof event.size !== 'number') return null;
    if (typeof event.mimeType !== 'string' || !event.mimeType.startsWith('image/')) return null;
    const image = record(event.image);
    return {
        ref: event.ref,
        name: event.name,
        size: event.size,
        mimeType: event.mimeType,
        ...(typeof image?.width === 'number' ? { width: image.width } : {}),
        ...(typeof image?.height === 'number' ? { height: image.height } : {}),
    };
}

export function attachDecodedImages(message: UserMessage, images: DecodedIncomingImage[]): UserMessage {
    if (images.length === 0) return message;
    return {
        ...message,
        meta: {
            ...message.meta,
            images: images.map((image) => ({
                data: Buffer.from(image.data).toString('base64'),
                mimeType: image.mimeType,
                name: image.name,
                ...(image.width !== undefined ? { width: image.width } : {}),
                ...(image.height !== undefined ? { height: image.height } : {}),
            })),
        },
    };
}
