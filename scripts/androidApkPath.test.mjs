import assert from 'node:assert/strict';
import { test } from 'node:test';

import { resolveAndroidApkPath } from './androidApkPath.mjs';

test('resolves an explicit APK path against the caller working directory', () => {
    assert.equal(
        resolveAndroidApkPath('artifacts/custom.apk', '/workspace/repo'),
        '/workspace/repo/artifacts/custom.apk',
    );
});

test('uses the repository latest artifact when no explicit APK path is provided', () => {
    assert.equal(
        resolveAndroidApkPath(undefined, '/caller', '/workspace/repo'),
        '/workspace/repo/artifacts/agenthub-production-arm64-latest.apk',
    );
});
