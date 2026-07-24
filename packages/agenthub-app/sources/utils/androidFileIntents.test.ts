import { describe, expect, it } from 'vitest';
import {
    ANDROID_ACTION_INSTALL_PACKAGE,
    ANDROID_ACTION_OPEN_DOCUMENT_TREE,
    ANDROID_ACTION_VIEW,
    ANDROID_CATEGORY_DEFAULT,
    ANDROID_EXTRA_INITIAL_URI,
    ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
    ANDROID_FLAG_GRANT_WRITE_URI_PERMISSION,
    ANDROID_MIME_APK,
    buildAndroidDirectoryOpenPlan,
    buildAndroidFileOpenIntents,
} from './androidFileIntents';

describe('androidFileIntents', () => {
    it('uses a package install intent first when opening APK files', () => {
        const uri = 'content://downloads/app-release.apk';

        expect(buildAndroidFileOpenIntents({ uri, fileName: 'app-release.APK' })).toEqual([
            {
                action: ANDROID_ACTION_INSTALL_PACKAGE,
                params: {
                    data: uri,
                    type: ANDROID_MIME_APK,
                    category: ANDROID_CATEGORY_DEFAULT,
                    flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
                },
            },
            {
                action: ANDROID_ACTION_VIEW,
                params: {
                    data: uri,
                    type: ANDROID_MIME_APK,
                    category: ANDROID_CATEGORY_DEFAULT,
                    flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
                },
            },
        ]);
    });

    it('uses ACTION_VIEW with the detected MIME type for non-APK files', () => {
        const uri = 'content://downloads/notes.txt';

        expect(buildAndroidFileOpenIntents({ uri, fileName: 'notes.txt' })).toEqual([
            {
                action: ANDROID_ACTION_VIEW,
                params: {
                    data: uri,
                    type: 'text/plain',
                    category: ANDROID_CATEGORY_DEFAULT,
                    flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION,
                },
            },
        ]);
    });

    it('opens SAF directories through the Android document tree UI', () => {
        const uri = 'content://com.android.externalstorage.documents/tree/primary%3ADownload';

        expect(buildAndroidDirectoryOpenPlan(uri)).toEqual({
            kind: 'intent',
            intents: [
                {
                    action: ANDROID_ACTION_OPEN_DOCUMENT_TREE,
                    params: {
                        category: ANDROID_CATEGORY_DEFAULT,
                        extra: {
                            [ANDROID_EXTRA_INITIAL_URI]: uri,
                        },
                        flags: ANDROID_FLAG_GRANT_READ_URI_PERMISSION | ANDROID_FLAG_GRANT_WRITE_URI_PERMISSION,
                    },
                },
            ],
        });
    });

    it('does not treat app-private file directories as browseable Android folders', () => {
        expect(buildAndroidDirectoryOpenPlan('file:///data/user/0/com.slopus.agenthub/files/downloads/')).toEqual({
            kind: 'unsupported-file-directory',
        });
    });
});
