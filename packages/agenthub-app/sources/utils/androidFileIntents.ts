import { getMimeTypeForFileName } from './fileTransfers';

export const ANDROID_ACTION_VIEW = 'android.intent.action.VIEW';
export const ANDROID_ACTION_INSTALL_PACKAGE = 'android.intent.action.INSTALL_PACKAGE';
export const ANDROID_ACTION_OPEN_DOCUMENT_TREE = 'android.intent.action.OPEN_DOCUMENT_TREE';
export const ANDROID_CATEGORY_DEFAULT = 'android.intent.category.DEFAULT';
export const ANDROID_EXTRA_INITIAL_URI = 'android.provider.extra.INITIAL_URI';
export const ANDROID_MIME_APK = 'application/vnd.android.package-archive';
export const ANDROID_FLAG_GRANT_READ_URI_PERMISSION = 1;
export const ANDROID_FLAG_GRANT_WRITE_URI_PERMISSION = 2;

export interface AndroidIntentSpec {
    action: string;
    params: {
        data?: string;
        type?: string;
        category?: string;
        extra?: Record<string, unknown>;
        flags?: number;
    };
}

export type AndroidDirectoryOpenPlan =
    | { kind: 'intent'; intents: AndroidIntentSpec[] }
    | { kind: 'unsupported-file-directory' };

export function buildAndroidFileOpenIntents({
    fileName,
    uri,
}: {
    fileName: string;
    uri: string;
}): AndroidIntentSpec[] {
    const mimeType = getMimeTypeForFileName(fileName);
    const viewIntent: AndroidIntentSpec = {
        action: ANDROID_ACTION_VIEW,
        params: {
            data: uri,
            type: mimeType,
            category: ANDROID_CATEGORY_DEFAULT,
            flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
        },
    };

    if (mimeType !== ANDROID_MIME_APK) {
        return [viewIntent];
    }

    return [
        {
            action: ANDROID_ACTION_INSTALL_PACKAGE,
            params: {
                data: uri,
                type: ANDROID_MIME_APK,
                category: ANDROID_CATEGORY_DEFAULT,
                flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
            },
        },
        viewIntent,
    ];
}

export function buildAndroidDirectoryOpenPlan(directoryUri: string): AndroidDirectoryOpenPlan {
    if (directoryUri.startsWith('file://')) {
        return { kind: 'unsupported-file-directory' };
    }

    if (isAndroidSafUri(directoryUri)) {
        return {
            kind: 'intent',
            intents: [
                {
                    action: ANDROID_ACTION_OPEN_DOCUMENT_TREE,
                    params: {
                        category: ANDROID_CATEGORY_DEFAULT,
                        extra: {
                            [ANDROID_EXTRA_INITIAL_URI]: directoryUri,
                        },
                        flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION | ANDROID_FLAG_GRANT_WRITE_URI_PERMISSION,
                    },
                },
            ],
        };
    }

    return {
        kind: 'intent',
        intents: [
            {
                action: ANDROID_ACTION_VIEW,
                params: {
                    data: directoryUri,
                    category: ANDROID_CATEGORY_DEFAULT,
                    flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
                },
            },
        ],
    };
}

function isAndroidSafUri(uri: string): boolean {
    return uri.startsWith('content://') && (
        uri.includes('/tree/') || uri.includes('/document/')
    );
}
