import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentHubConfigManifest } from './configManifest';

const appRoot = join(__dirname, '..', '..');

function readAppFile(path: string) {
    return readFileSync(join(appRoot, path), 'utf8');
}

function loadTauriConfig(path: string) {
    return JSON.parse(readAppFile(path)) as {
        productName?: string;
        version?: string;
        identifier?: string;
        app?: {
            windows?: Array<{
                title?: string;
            }>;
        };
    };
}

describe('AgentHub generated platform config', () => {
    it('keeps Expo app config aligned with AgentHub manifest for each variant', async () => {
        const previousAppEnv = process.env.APP_ENV;
        const loadExpoConfig = async (variant: 'development' | 'preview' | 'production') => {
            process.env.APP_ENV = variant === 'development' ? '' : variant;
            const configUrl = pathToFileURL(join(appRoot, 'app.config.js'));
            const module = await import(`${configUrl.href}?variant=${variant}-${Date.now()}`);
            return module.default.expo as {
                name: string;
                slug: string;
                version: string;
                runtimeVersion: string;
                updates: { enableBsdiffPatchSupport?: boolean };
                scheme: string;
                ios: { bundleIdentifier: string };
                android: { package: string; googleServicesFile?: string };
                plugins?: unknown[];
            };
        };

        try {
            for (const variant of ['development', 'preview', 'production'] as const) {
                const config = await loadExpoConfig(variant);
                const expected = agentHubConfigManifest.expo.variants[variant];
                expect(config.name).toBe(expected.name);
                expect(config.ios.bundleIdentifier).toBe(expected.bundleIdentifier);
                expect(config.android.package).toBe(expected.bundleIdentifier);
                expect(config.android.googleServicesFile).toBe(variant === 'production' ? './google-services.json' : undefined);
                expect(config.slug).toBe(agentHubConfigManifest.expo.slug);
                expect(config.scheme).toBe(agentHubConfigManifest.expo.scheme);
                expect(config.version).toBe(agentHubConfigManifest.expo.version);
                expect(config.runtimeVersion).toBe(agentHubConfigManifest.expo.runtimeVersion);
                expect(config.updates.enableBsdiffPatchSupport).toBe(true);
            }
        } finally {
            process.env.APP_ENV = previousAppEnv;
        }
    });

    it('keeps Android splash image inside the Android 12 icon safe area', async () => {
        const previousAppEnv = process.env.APP_ENV;
        try {
            process.env.APP_ENV = 'production';
            const configUrl = pathToFileURL(join(appRoot, 'app.config.js'));
            const module = await import(`${configUrl.href}?android-splash-${Date.now()}`);
            const config = module.default.expo as { plugins?: unknown[] };
            const splashPlugin = config.plugins?.find((plugin): plugin is [string, {
                android?: { image?: string; imageWidth?: number; dark?: { image?: string; imageWidth?: number } };
                ios?: { image?: string; imageWidth?: number; dark?: { image?: string; imageWidth?: number } };
            }] => (
                Array.isArray(plugin) && plugin[0] === 'expo-splash-screen'
            ));

            expect(splashPlugin).toBeDefined();
            expect(splashPlugin?.[1].ios?.image).toBe('./sources/assets/images/agenthub-icon.png');
            expect(splashPlugin?.[1].ios?.imageWidth).toBe(100);
            expect(splashPlugin?.[1].ios?.dark?.image).toBe('./sources/assets/images/agenthub-icon.png');
            expect(splashPlugin?.[1].ios?.dark?.imageWidth).toBe(100);
            expect(splashPlugin?.[1].android?.image).toBe('./sources/assets/images/agenthub-icon.png');
            expect(splashPlugin?.[1].android?.imageWidth).toBe(100);
            expect(splashPlugin?.[1].android?.dark?.image).toBe('./sources/assets/images/agenthub-icon.png');
            expect(splashPlugin?.[1].android?.dark?.imageWidth).toBe(100);
        } finally {
            process.env.APP_ENV = previousAppEnv;
        }
    });

    it('keeps native Android production config aligned with AgentHub manifest', () => {
        const buildGradle = readAppFile('android/app/build.gradle');
        const stringsXml = readAppFile('android/app/src/main/res/values/strings.xml');
        const androidManifest = readAppFile('android/app/src/main/AndroidManifest.xml');
        const expected = agentHubConfigManifest.androidProduction;

        expect(buildGradle).toContain(`namespace '${expected.namespace}'`);
        expect(buildGradle).toContain(`applicationId '${expected.applicationId}'`);
        expect(buildGradle).toContain(`versionName "${expected.versionName}"`);
        expect(stringsXml).toContain(`<string name="app_name">${expected.appName}</string>`);
        expect(androidManifest).toContain(
            '<meta-data android:name="expo.modules.updates.ENABLE_BSDIFF_PATCH_SUPPORT" android:value="true"/>',
        );
    });

    it('keeps Tauri config files aligned with AgentHub manifest', () => {
        const production = loadTauriConfig('src-tauri/tauri.conf.json');
        const preview = loadTauriConfig('src-tauri/tauri.preview.conf.json');
        const development = loadTauriConfig('src-tauri/tauri.dev.conf.json');

        expect({
            productName: production.productName,
            identifier: production.identifier,
            title: production.app?.windows?.[0]?.title,
            version: production.version,
        }).toEqual(agentHubConfigManifest.tauri.production);
        expect({
            productName: preview.productName,
            identifier: preview.identifier,
            title: preview.app?.windows?.[0]?.title,
        }).toEqual(agentHubConfigManifest.tauri.preview);
        expect({
            productName: development.productName,
            identifier: development.identifier,
            title: development.app?.windows?.[0]?.title,
        }).toEqual(agentHubConfigManifest.tauri.development);
    });
});
