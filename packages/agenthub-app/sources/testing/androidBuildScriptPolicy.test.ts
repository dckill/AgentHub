import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const buildScript = readFileSync(resolve(__dirname, '../../../../scripts/build-android.sh'), 'utf8');
const rootPackage = JSON.parse(readFileSync(resolve(__dirname, '../../../../package.json'), 'utf8'));

describe('Android native dependency build policy', () => {
    it('extracts libsodium beside the dependency CMake file instead of into tracked App build output', () => {
        expect(buildScript).toContain('LIBSODIUM_PACKAGE_DIR="$APP_DIR/node_modules/@more-tech/react-native-libsodium/libsodium"');
        expect(buildScript).toContain('tar -xzf "$LIBSODIUM_TGZ" -C "$LIBSODIUM_PACKAGE_DIR"');
        expect(buildScript).not.toContain('LIBSODIUM_BUILD="$APP_DIR/libsodium/build"');
    });

    it('resolves native tools and packages from the App package in an isolated workspace', () => {
        expect(buildScript).toContain('SKIA_LIBS="$APP_DIR/node_modules/@shopify/react-native-skia/libs/android"');
        expect(buildScript).toContain('run_pnpm --dir "$APP_DIR" exec install-skia');
        expect(buildScript).toContain('run_pnpm --dir "$APP_DIR" exec expo prebuild --platform android');
        expect(buildScript).not.toContain('npx install-skia');
        expect(buildScript).not.toContain('npx expo prebuild');
    });

    it('declares the react-native-svg Buffer runtime import through an isolated package extension', () => {
        expect(rootPackage.pnpm.packageExtensions['react-native-svg@15.12.1'].dependencies.buffer).toBe('6.0.3');
    });

    it('exports the public build variant so production can dead-strip Preview route registration', () => {
        expect(buildScript).toContain('export EXPO_PUBLIC_AGENTHUB_APP_VARIANT="$APP_ENV"');
    });

    it('restores the tracked Android tree to the Production variant after every non-Production build exit', () => {
        expect(buildScript).toContain('ANDROID_TREE_MUTATED=false');
        expect(buildScript).toContain('restore_production_android_tree()');
        expect(buildScript).toContain('if [ "$APP_ENV" = "production" ] || [ "$ANDROID_TREE_MUTATED" != "true" ]; then');
        expect(buildScript).toContain('trap restore_production_android_tree EXIT');
        expect(buildScript).toContain('APP_ENV=production EXPO_NO_OTA="$NO_OTA" run_pnpm --dir "$APP_DIR" exec expo prebuild --platform android');
        expect(buildScript).toContain('rm -f "$PREBUILD_STAMP_FILE"');
    });

    it('keeps Android signing passwords out of the Gradle process argv', () => {
        expect(buildScript).not.toContain('-PagenthubUploadStorePassword=');
        expect(buildScript).not.toContain('-PagenthubUploadKeyPassword=');
        expect(buildScript).toContain('ORG_GRADLE_PROJECT_agenthubUploadStorePassword="${AGENTHUB_ANDROID_UPLOAD_STORE_PASSWORD:-}"');
        expect(buildScript).toContain('ORG_GRADLE_PROJECT_agenthubUploadKeyPassword="${AGENTHUB_ANDROID_UPLOAD_KEY_PASSWORD:-}"');
    });
});
