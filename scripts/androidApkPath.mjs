import { isAbsolute, join, resolve } from 'node:path';

export function resolveAndroidApkPath(input, callerCwd, repoRoot) {
    if (!input) {
        return join(repoRoot, 'artifacts', 'agenthub-production-arm64-latest.apk');
    }
    return isAbsolute(input) ? input : resolve(callerCwd, input);
}
