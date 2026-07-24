/**
 * Patches @more-tech/react-native-libsodium to respect the reactNativeArchitectures
 * Gradle property instead of hardcoding all four architectures in CMake abiFilters.
 *
 * Without this patch, the library always builds native code for x86, x86_64,
 * armeabi-v7a, and arm64-v8a regardless of the -PreactNativeArchitectures flag.
 */
const fs = require('fs');
const path = require('path');

const packageRoot = process.env.AGENTHUB_LIBSODIUM_PACKAGE_ROOT
    || path.resolve(__dirname, '..', 'packages/agenthub-app/node_modules/@more-tech/react-native-libsodium');
const files = [path.join(packageRoot, 'android/build.gradle')];

let patched = 0;

const original = '        abiFilters "x86", "x86_64", "armeabi-v7a", "arm64-v8a"';
const replacement = `        def rnArchs = rootProject.hasProperty("reactNativeArchitectures") ? rootProject.property("reactNativeArchitectures").split(",") : ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"] as String[]
        abiFilters(*rnArchs)`;

for (const file of files) {
    const filePath = path.resolve(file);
    if (!fs.existsSync(filePath)) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    const before = content;

    content = content.replace(original, replacement);

    if (content !== before) {
        fs.writeFileSync(filePath, content, 'utf8');
        patched++;
    }
}

if (patched > 0) {
    console.log(`[patch] Fixed react-native-libsodium architecture filtering (${patched} file(s))`);
}
