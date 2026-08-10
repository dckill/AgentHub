import type { PermissionModeKey } from '@/utils/permissionMode';
import { RawRecord } from './typesRaw';

export type BuildUserMessageContentParams = {
    text: string;
    displayText?: string;
    fileReferences?: string[];
    sentFrom: string;
    turnOriginDevice: string;
    permissionMode: PermissionModeKey;
    model: string | null;
    effort: string | null;
    appendSystemPrompt: string;
};

/** Build the encrypted/local raw record for a user-authored text message. */
export function buildUserMessageContent({
    text,
    displayText,
    fileReferences,
    sentFrom,
    turnOriginDevice,
    permissionMode,
    model,
    effort,
    appendSystemPrompt,
}: BuildUserMessageContentParams): RawRecord {
    return {
        role: 'user',
        content: {
            type: 'text',
            text,
        },
        meta: {
            sentFrom,
            turnOriginDevice,
            permissionMode,
            model,
            effort,
            fallbackModel: null,
            appendSystemPrompt,
            ...(displayText && { displayText }),
            ...(fileReferences && fileReferences.length > 0 && { fileReferences }),
        },
    };
}
