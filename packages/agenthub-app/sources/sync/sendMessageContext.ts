import type { MessageSentSource } from '@/track';
import type { Session } from './storageTypes';
import { resolveMessageModeMeta } from './messageMeta';

type SendMessageContextOptions = {
    displayText?: string;
    fileReferences?: string[];
    images?: Array<{
        data: string;
        mimeType: string;
        name?: string;
        width?: number;
        height?: number;
    }>;
    source?: MessageSentSource;
};

export function resolveSendMessageContext({
    session,
    options,
}: {
    session: Pick<Session, 'permissionMode' | 'modelMode' | 'effortLevel' | 'metadata'>;
    options?: SendMessageContextOptions;
}) {
    const { permissionMode, model, effort } = resolveMessageModeMeta(session);
    const { displayText, fileReferences, images, source = 'chat' } = options ?? {};

    return {
        permissionMode,
        model,
        effort,
        displayText,
        fileReferences,
        images,
        source,
    };
}
