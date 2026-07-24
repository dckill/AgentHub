import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { auditNativeQaEvidence, formatNativeQaEvidenceMarkdown } from './nativeQaEvidence';

const repoRoot = resolve(process.cwd(), '../..');
const androidQaCommand = 'PATH="$ANDROID_HOME/platform-tools:$PATH" npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:android';
const androidFallbackCommand = 'PATH="$ANDROID_HOME/platform-tools:$PATH" node scripts/agenthub-android-native-qa.mjs';
const iosQaCommand = (root: string) =>
    `AGENTHUB_IOS_APP="${join(root, 'artifacts', 'AgentHubPreview.app')}" npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:ios`;
const iosFallbackCommand = (root: string) =>
    `AGENTHUB_IOS_APP="${join(root, 'artifacts', 'AgentHubPreview.app')}" node scripts/agenthub-ios-native-qa.mjs`;

function makeArtifactsDir() {
    return mkdtempSync(join(tmpdir(), 'agenthub-native-qa-'));
}

function writeJson(path: string, value: unknown) {
    writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

const validPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
    0x89,
]);

function writePng(path: string) {
    writeFileSync(path, validPng);
}

function writeApk(path: string) {
    writeFileSync(path, Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]));
}

describe('AgentHub native QA evidence audit', () => {
    it('accepts screenshot-free automated contract reports for both platforms', () => {
        const localRepoRoot = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-repo-'));
        const artifactsDir = join(localRepoRoot, 'artifacts');
        mkdirSync(artifactsDir);
        const automatedReport = { verificationMode: 'automated-contract', status: 'completed' };
        const apkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const appPath = join(artifactsDir, 'AgentHubPreview.app');
        writeApk(apkPath);
        mkdirSync(appPath);
        writeJson(join(artifactsDir, 'agenthub-v02-android-native-qa-20260717-1320.json'), {
            ...automatedReport,
            qaProfile: 'production-smoke',
            semanticReady: true,
            apkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            steps: [{ label: 'verify production content', status: 0 }],
        });
        writeJson(join(artifactsDir, 'agenthub-v02-ios-native-qa-20260717-1320.json'), {
            ...automatedReport,
            appPath,
            bundleIdentifier: 'com.artsum.agenthub',
            automationStatus: 'completed',
            steps: [{ label: 'collect system log tail', status: 0 }],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot: localRepoRoot });

        expect(result.failures).toEqual([]);
        expect(result.blockers).toEqual([]);
        expect(result.status).toBe('completed');
        expect(result.readyToMarkV02Done).toBe(true);
        expect(result.android.deliveryVerified).toBe(true);
        expect(result.android.automatedVerified).toBe(true);
        expect(result.android.visualVerified).toBe(false);
        expect(result.android.screenshots).toEqual([]);
        expect(result.ios.appVerified).toBe(true);
        expect(result.ios.screenshots).toEqual([]);
    });

    it('keeps Android partial when completed evidence only covers an x86_64 QA APK', () => {
        const artifactsDir = makeArtifactsDir();
        const androidTimestamp = '20260705-0421';
        const iosTimestamp = '20260705-0432';
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const x86QaApkPath = join(
            artifactsDir,
            'agenthub-preview-agentport-x86_64-qa-preview-agentport-x86-64-compact-latest.apk',
        );

        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeApk(x86QaApkPath);
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: x86QaApkPath,
            packageName: 'com.artsum.agenthub',
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('partial');
        expect(result.readyToMarkV02Done).toBe(false);
        expect(result.repoRoot).toBe(repoRoot);
        expect(result.artifactsDir).toBe(artifactsDir);
        expect(result.handoffPath).toBe(`${repoRoot}/docs/agenthub-v02-native-qa-handoff.md`);
        expect(result.android.status).toBe('completed');
        expect(result.android.reportPath.endsWith(`agenthub-v02-android-native-qa-${androidTimestamp}.json`)).toBe(true);
        expect(result.android.packageName).toBe('com.artsum.agenthub');
        expect(result.android.deviceAbi).toBeUndefined();
        expect(result.android.screenshots).toEqual(androidScreenshots);
        expect(result.ios.status).toBe('blocked');
        expect(result.ios.bundleIdentifier).toBe('com.artsum.agenthub');
        expect(result.blockers).toEqual([
            'Android arm64 delivery APK has not been installed on an arm64 device in this evidence set.',
            'iOS native QA is blocked: xcrun simctl not found',
        ]);
        expect(result.completionCriteria).toEqual([
            {
                id: 'android-arm64-apk',
                label: 'Android arm64 delivery APK exists',
                passed: true,
                evidence: join(artifactsDir, 'agenthub-production-arm64-latest.apk'),
            },
            {
                id: 'android-arm64-native-qa',
                label: 'Android arm64 device native QA completed',
                passed: false,
                evidence: result.android.reportPath,
            },
            {
                id: 'ios-native-qa',
                label: 'iOS native QA completed',
                passed: false,
                evidence: result.ios.reportPath,
            },
            {
                id: 'native-qa-failures',
                label: 'Native QA audit has no failures',
                passed: true,
                evidence: 'failures: 0',
            },
        ]);
        expect(result.nextActions).toEqual([
            {
                platform: 'android',
                reason: 'Install and capture the arm64 delivery APK on an arm64 Android device.',
                command: androidQaCommand,
                fallbackCommand: androidFallbackCommand,
            },
            {
                platform: 'ios',
                reason: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
                command: iosQaCommand(repoRoot),
                fallbackCommand: iosFallbackCommand(repoRoot),
            },
        ]);

        const reportPath = join(artifactsDir, 'agenthub-v02-native-qa-evidence-latest.json');
        const markdownPath = join(artifactsDir, 'agenthub-v02-native-qa-evidence-latest.md');
        const markdown = formatNativeQaEvidenceMarkdown({ ...result, reportPath, markdownPath });

        expect(markdown).toContain('# AgentHub V02 Native QA Evidence');
        expect(markdown).toContain('- Status: `partial`');
        expect(markdown).toContain('- Ready to mark V02 done: `false`');
        expect(markdown).toContain(`- Repository root: \`${repoRoot}\``);
        expect(markdown).toContain(`- Artifacts dir: \`${artifactsDir}\``);
        expect(markdown).toContain(`- Evidence JSON: \`${reportPath}\``);
        expect(markdown).toContain(`- Evidence Markdown: \`${markdownPath}\``);
        expect(markdown).toContain(
            `- Native QA handoff: \`${repoRoot}/docs/agenthub-v02-native-qa-handoff.md\``,
        );
        expect(markdown).toContain(`- Android report: \`${result.android.reportPath}\``);
        expect(markdown).toContain('- Android package: `com.artsum.agenthub`');
        expect(markdown).toContain(`- Android screenshot launch: \`${androidScreenshots[0].path}\``);
        expect(markdown).toContain('- Android delivery verified: `false`');
        expect(markdown).toContain('## Completion Criteria');
        expect(markdown).toContain('- [x] Android arm64 delivery APK exists');
        expect(markdown).toContain('- [ ] Android arm64 device native QA completed');
        expect(markdown).toContain('- iOS status: `blocked`');
        expect(markdown).toContain('- iOS bundle: `com.artsum.agenthub`');
        expect(markdown).toContain('Android arm64 delivery APK has not been installed on an arm64 device in this evidence set.');
        expect(markdown).toContain(androidQaCommand);
        expect(markdown).toContain(androidFallbackCommand);
        expect(markdown).toContain('Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.');
        expect(markdown).toContain(iosFallbackCommand(repoRoot));
    });

    it('accepts Android arm64 delivery evidence when the latest report installed the arm64 APK on an arm64 device', () => {
        const artifactsDir = makeArtifactsDir();
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0432';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            qaProfile: 'production-smoke',
            semanticReady: true,
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: {
                id: 'R5CT123456A',
                state: 'device',
                details: 'product:dm3q model:SM_S9180 device:dm3q transport_id:7',
                abi: 'arm64-v8a',
            },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('partial');
        expect(result.readyToMarkV02Done).toBe(false);
        expect(result.android.status).toBe('completed');
        expect(result.android.packageName).toBe('com.artsum.agenthub');
        expect(result.android.deviceAbi).toBe('arm64-v8a');
        expect(result.android.screenshots).toEqual(androidScreenshots);
        expect(result.blockers).toEqual(['iOS native QA is blocked: xcrun simctl not found']);
        expect(result.nextActions).toEqual([
            {
                platform: 'ios',
                reason: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
                command: iosQaCommand(repoRoot),
                fallbackCommand: iosFallbackCommand(repoRoot),
            },
        ]);
    });

    it('keeps Android blocked reports as blockers and carries their next action into the audit', () => {
        const artifactsDir = makeArtifactsDir();
        const androidTimestamp = '20260705-0620';
        const iosTimestamp = '20260705-0630';
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'blocked',
            reason: 'ANDROID_HOME not set',
            packageName: 'com.artsum.agenthub',
            nextAction: 'Set ANDROID_HOME to the Android SDK root, then rerun agenthub:native:android.',
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('partial');
        expect(result.failures).toEqual([]);
        expect(result.blockers).toEqual([
            'Android native QA is blocked: ANDROID_HOME not set',
            'iOS native QA is blocked: xcrun simctl not found',
        ]);
        expect(result.nextActions).toEqual([
            {
                platform: 'android',
                reason: 'Set ANDROID_HOME to the Android SDK root, then rerun agenthub:native:android.',
                command: androidQaCommand,
                fallbackCommand: androidFallbackCommand,
            },
            {
                platform: 'ios',
                reason: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
                command: iosQaCommand(repoRoot),
                fallbackCommand: iosFallbackCommand(repoRoot),
            },
        ]);

        const markdown = formatNativeQaEvidenceMarkdown(result);
        expect(markdown).toContain('Android native QA is blocked: ANDROID_HOME not set');
        expect(markdown).toContain('Set ANDROID_HOME to the Android SDK root, then rerun agenthub:native:android.');
    });

    it('omits blocked report screenshot paths that point outside the artifacts directory', () => {
        const artifactsDir = makeArtifactsDir();
        const outsideDir = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-outside-'));
        const outsideScreenshot = join(outsideDir, 'agenthub-v02-android-launch-20260705-0621.png');
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writePng(outsideScreenshot);
        writeJson(join(artifactsDir, 'agenthub-v02-android-native-qa-20260705-0621.json'), {
            status: 'blocked',
            reason: 'ANDROID_HOME not set',
            packageName: 'com.artsum.agenthub',
            screenshots: [
                {
                    name: 'launch',
                    path: outsideScreenshot,
                },
                {
                    name: 'modal',
                    path: join(artifactsDir, 'agenthub-v02-android-modal-20260705-0621.png'),
                },
            ],
        });
        writeJson(join(artifactsDir, 'agenthub-v02-ios-native-qa-20260705-0621.json'), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });
        const markdown = formatNativeQaEvidenceMarkdown(result);

        expect(result.status).toBe('partial');
        expect(result.android.screenshots).toEqual([
            {
                name: 'launch',
            },
            {
                name: 'modal',
                path: join(artifactsDir, 'agenthub-v02-android-modal-20260705-0621.png'),
            },
        ]);
        expect(markdown).not.toContain(outsideScreenshot);
    });

    it('marks V02 ready when Android arm64 and iOS native QA evidence are both complete', () => {
        const artifactsDir = makeArtifactsDir();
        const testRepoRoot = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-repo-'));
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0530';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const iosAppPath = join(testRepoRoot, 'artifacts', 'AgentHubPreview.app');
        const androidScreenshots = ['launch'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const androidPreviewScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-preview-${name}-${androidTimestamp}.png`),
        }));
        const iosScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-ios-${name}-${iosTimestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        mkdirSync(iosAppPath, { recursive: true });
        for (const screenshot of [...androidScreenshots, ...androidPreviewScreenshots, ...iosScreenshots]) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            qaProfile: 'production-smoke',
            semanticReady: true,
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-android-preview-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            qaProfile: 'preview-visual',
            apkPath: join(artifactsDir, 'agenthub-preview-arm64-latest.apk'),
            packageName: 'com.artsum.agenthub.preview',
            device: { abi: 'arm64-v8a' },
            screenshots: androidPreviewScreenshots,
        });
        writeApk(join(artifactsDir, 'agenthub-preview-arm64-latest.apk'));
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: iosAppPath,
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: iosScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot: testRepoRoot });

        expect(result.status).toBe('completed');
        expect(result.readyToMarkV02Done).toBe(true);
        expect(result.blockers).toEqual([]);
        expect(result.failures).toEqual([]);
        expect(result.android.deliveryVerified).toBe(true);
        expect(result.android.visualVerified).toBe(true);
        expect(result.completionCriteria.every((criterion) => criterion.passed)).toBe(true);
        expect(formatNativeQaEvidenceMarkdown(result)).toContain('- Ready to mark V02 done: `true`');
    });

    it('fails when the Android arm64 delivery APK artifact path is a directory', () => {
        const artifactsDir = makeArtifactsDir();
        const testRepoRoot = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-repo-'));
        const androidTimestamp = '20260705-0521';
        const iosTimestamp = '20260705-0530';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const iosAppPath = join(testRepoRoot, 'artifacts', 'AgentHubPreview.app');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const iosScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-ios-${name}-${iosTimestamp}.png`),
        }));

        mkdirSync(arm64ApkPath, { recursive: true });
        mkdirSync(iosAppPath, { recursive: true });
        for (const screenshot of [...androidScreenshots, ...iosScreenshots]) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: iosAppPath,
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: iosScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot: testRepoRoot });

        expect(result.status).toBe('failed');
        expect(result.readyToMarkV02Done).toBe(false);
        expect(result.failures).toContain(`Android arm64 delivery APK is not a file: ${arm64ApkPath}`);
        expect(result.completionCriteria.find((criterion) => criterion.id === 'android-arm64-apk')).toEqual({
            id: 'android-arm64-apk',
            label: 'Android arm64 delivery APK exists',
            passed: false,
            evidence: arm64ApkPath,
        });
    });

    it('fails when the Android arm64 delivery APK artifact is not a ZIP/APK file', () => {
        const artifactsDir = makeArtifactsDir();
        const testRepoRoot = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-repo-'));
        const androidTimestamp = '20260705-0522';
        const iosTimestamp = '20260705-0530';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const iosAppPath = join(testRepoRoot, 'artifacts', 'AgentHubPreview.app');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const iosScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-ios-${name}-${iosTimestamp}.png`),
        }));

        writeFileSync(arm64ApkPath, 'not-an-apk');
        mkdirSync(iosAppPath, { recursive: true });
        for (const screenshot of [...androidScreenshots, ...iosScreenshots]) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: iosAppPath,
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: iosScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot: testRepoRoot });

        expect(result.status).toBe('failed');
        expect(result.readyToMarkV02Done).toBe(false);
        expect(result.failures).toContain(`Android arm64 delivery APK is not a valid APK/ZIP artifact: ${arm64ApkPath}`);
        expect(result.completionCriteria.find((criterion) => criterion.id === 'android-arm64-apk')).toEqual({
            id: 'android-arm64-apk',
            label: 'Android arm64 delivery APK exists',
            passed: false,
            evidence: arm64ApkPath,
        });
    });

    it('fails when iOS completed evidence references the expected app path but the app artifact is missing', () => {
        const artifactsDir = makeArtifactsDir();
        const testRepoRoot = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-repo-'));
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0531';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const iosAppPath = join(testRepoRoot, 'artifacts', 'AgentHubPreview.app');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const iosScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-ios-${name}-${iosTimestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        for (const screenshot of [...androidScreenshots, ...iosScreenshots]) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: iosAppPath,
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: iosScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot: testRepoRoot });

        expect(result.status).toBe('failed');
        expect(result.readyToMarkV02Done).toBe(false);
        expect(result.ios.appVerified).toBe(false);
        expect(result.failures).toContain(`Missing iOS app artifact: ${iosAppPath}`);
    });

    it('fails when iOS completed evidence references an app artifact path that is not a directory', () => {
        const artifactsDir = makeArtifactsDir();
        const testRepoRoot = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-repo-'));
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0532';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const iosAppPath = join(testRepoRoot, 'artifacts', 'AgentHubPreview.app');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const iosScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-ios-${name}-${iosTimestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        mkdirSync(join(testRepoRoot, 'artifacts'), { recursive: true });
        writeFileSync(iosAppPath, 'not-a-directory');
        for (const screenshot of [...androidScreenshots, ...iosScreenshots]) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: iosAppPath,
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: iosScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot: testRepoRoot });

        expect(result.status).toBe('failed');
        expect(result.readyToMarkV02Done).toBe(false);
        expect(result.ios.appVerified).toBe(false);
        expect(result.failures).toContain(`iOS app artifact is not a directory: ${iosAppPath}`);
    });

    it('fails when iOS completed evidence did not install the expected AgentHubPreview.app artifact', () => {
        const artifactsDir = makeArtifactsDir();
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0530';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const iosScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-ios-${name}-${iosTimestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        for (const screenshot of [...androidScreenshots, ...iosScreenshots]) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: join(artifactsDir, 'OtherPreview.app'),
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: iosScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.readyToMarkV02Done).toBe(false);
        expect(result.ios.appVerified).toBe(false);
        expect(result.failures).toContain(
            `Unexpected iOS app path in QA report: ${join(artifactsDir, 'OtherPreview.app')}`,
        );
        expect(result.completionCriteria.find((criterion) => criterion.id === 'ios-native-qa')).toEqual({
            id: 'ios-native-qa',
            label: 'iOS native QA completed',
            passed: false,
            evidence: result.ios.reportPath,
        });
    });

    it('fails when the latest Android completed report references a missing screenshot', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0421';
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            packageName: 'com.artsum.agenthub',
            screenshots: [
                {
                    name: 'launch',
                    path: join(artifactsDir, `agenthub-v02-android-launch-${timestamp}.png`),
                },
            ],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Missing Android screenshot: ${join(artifactsDir, `agenthub-v02-android-launch-${timestamp}.png`)}`);
    });

    it('fails when the latest Android completed report references a screenshot directory', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0422';
        const screenshotDir = join(artifactsDir, `agenthub-v02-android-launch-${timestamp}.png`);
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        mkdirSync(screenshotDir, { recursive: true });
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            packageName: 'com.artsum.agenthub',
            screenshots: [
                {
                    name: 'launch',
                    path: screenshotDir,
                },
            ],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Android screenshot is not a file: ${screenshotDir}`);
    });

    it('fails when the latest Android completed report references an empty screenshot file', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0423';
        const screenshotPath = join(artifactsDir, `agenthub-v02-android-launch-${timestamp}.png`);
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeFileSync(screenshotPath, '');
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            packageName: 'com.artsum.agenthub',
            screenshots: [
                {
                    name: 'launch',
                    path: screenshotPath,
                },
            ],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Android screenshot is empty: ${screenshotPath}`);
    });

    it('fails when the latest Android completed report references a non-PNG screenshot file', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0425';
        const screenshotPath = join(artifactsDir, `agenthub-v02-android-launch-${timestamp}.txt`);
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeFileSync(screenshotPath, 'not-png');
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            packageName: 'com.artsum.agenthub',
            screenshots: [
                {
                    name: 'launch',
                    path: screenshotPath,
                },
            ],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Android screenshot is not a PNG artifact: ${screenshotPath}`);
    });

    it('fails when the latest Android completed report references a .png screenshot with invalid PNG bytes', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0426';
        const screenshotPath = join(artifactsDir, `agenthub-v02-android-launch-${timestamp}.png`);
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeFileSync(screenshotPath, 'not-a-png');
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            packageName: 'com.artsum.agenthub',
            screenshots: [
                {
                    name: 'launch',
                    path: screenshotPath,
                },
            ],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Android screenshot is not a valid PNG artifact: ${screenshotPath}`);
    });

    it('fails when the latest Android completed report reuses one screenshot path for multiple required scenes', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0424';
        const sharedScreenshotPath = join(artifactsDir, `agenthub-v02-android-shared-${timestamp}.png`);
        const androidScreenshots = [
            {
                name: 'launch',
                path: sharedScreenshotPath,
            },
            {
                name: 'modal',
                path: sharedScreenshotPath,
            },
            ...['prompt-keyboard', 'long-content'].map((name) => ({
                name,
                path: join(artifactsDir, `agenthub-v02-android-${name}-${timestamp}.png`),
            })),
        ];

        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writePng(sharedScreenshotPath);
        for (const screenshot of androidScreenshots.slice(2)) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            packageName: 'com.artsum.agenthub',
            screenshots: androidScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Android QA screenshot path is reused: ${sharedScreenshotPath}`);
    });

    it('fails when the latest Android completed report repeats a required screenshot scene name', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0427';
        const androidScreenshots = [
            {
                name: 'launch',
                path: join(artifactsDir, `agenthub-v02-android-launch-a-${timestamp}.png`),
            },
            {
                name: 'launch',
                path: join(artifactsDir, `agenthub-v02-android-launch-b-${timestamp}.png`),
            },
            ...['modal', 'prompt-keyboard', 'long-content'].map((name) => ({
                name,
                path: join(artifactsDir, `agenthub-v02-android-${name}-${timestamp}.png`),
            })),
        ];

        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            packageName: 'com.artsum.agenthub',
            screenshots: androidScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain('Android QA screenshot name is reused: launch');
    });

    it('fails with structure errors when Android completed evidence has invalid APK and screenshot fields', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0740';
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            apkPath: 42,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: [
                {
                    name: 7,
                    path: join(artifactsDir, `agenthub-v02-android-launch-${timestamp}.png`),
                },
            ],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain('Android QA report apkPath must be a string.');
        expect(result.failures).toContain('Android QA screenshot entry has invalid name: 7');
        expect(result.android.deliveryVerified).toBe(false);
    });

    it('fails with a clear structure error when Android completed evidence uses a relative APK path', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0743';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${timestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            apkPath: 'artifacts/agenthub-production-arm64-latest.apk',
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${timestamp}.json`), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain('Android QA report apkPath must be an absolute path.');
        expect(result.android.deliveryVerified).toBe(false);
    });

    it('fails when Android completed evidence references a missing apkPath artifact', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0744';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const missingReportApkPath = join(artifactsDir, 'missing-report-apk.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${timestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            apkPath: missingReportApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${timestamp}.json`), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Missing Android QA report APK artifact: ${missingReportApkPath}`);
        expect(result.android.deliveryVerified).toBe(false);
    });

    it('fails when Android completed evidence references an APK artifact outside artifacts', () => {
        const artifactsDir = makeArtifactsDir();
        const outsideDir = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-outside-apk-'));
        const timestamp = '20260705-0748';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const outsideApkPath = join(outsideDir, 'agenthub-outside.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${timestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        writeApk(outsideApkPath);
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            apkPath: outsideApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${timestamp}.json`), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Android QA report APK artifact is outside artifacts dir: ${outsideApkPath}`);
        expect(result.android.deliveryVerified).toBe(false);
    });

    it('fails with a structure error when Android completed evidence screenshots is not an array', () => {
        const artifactsDir = makeArtifactsDir();
        const timestamp = '20260705-0741';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        writeApk(arm64ApkPath);
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: 'not-array',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain('Android QA report screenshots must be an array.');
        expect(result.android.screenshots).toBeUndefined();
    });

    it('fails when Android completed evidence references screenshots outside the artifacts directory', () => {
        const artifactsDir = makeArtifactsDir();
        const outsideDir = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-outside-'));
        const timestamp = '20260705-0742';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const outsideScreenshot = join(outsideDir, `agenthub-v02-android-launch-${timestamp}.png`);
        const androidScreenshots = [
            {
                name: 'launch',
                path: outsideScreenshot,
            },
            ...['modal', 'prompt-keyboard', 'long-content'].map((name) => ({
                name,
                path: join(artifactsDir, `agenthub-v02-android-${name}-${timestamp}.png`),
            })),
        ];

        writeApk(arm64ApkPath);
        writePng(outsideScreenshot);
        for (const screenshot of androidScreenshots.slice(1)) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${timestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, 'agenthub-v02-ios-native-qa-20260705-0742.json'), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Android QA screenshot launch is outside artifacts dir: ${outsideScreenshot}`);
    });

    it('fails when the latest iOS completed report references a missing screenshot', () => {
        const artifactsDir = makeArtifactsDir();
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0530';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const missingIosScreenshot = join(artifactsDir, `agenthub-v02-ios-launch-${iosTimestamp}.png`);

        writeApk(arm64ApkPath);
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: [
                {
                    name: 'launch',
                    path: missingIosScreenshot,
                },
            ],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`Missing iOS screenshot: ${missingIosScreenshot}`);
    });

    it('fails with structure errors when iOS completed evidence has invalid app and screenshot fields', () => {
        const artifactsDir = makeArtifactsDir();
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0745';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: 42,
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: [
                {
                    name: 'launch',
                    path: 7,
                },
            ],
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain('iOS QA report appPath must be a string.');
        expect(result.failures).toContain('iOS QA screenshot launch has invalid path: 7');
        expect(result.ios.appVerified).toBe(false);
    });

    it('fails with a clear structure error when iOS completed evidence uses a relative app path', () => {
        const artifactsDir = makeArtifactsDir();
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0747';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const iosScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-ios-${name}-${iosTimestamp}.png`),
        }));

        writeApk(arm64ApkPath);
        for (const screenshot of [...androidScreenshots, ...iosScreenshots]) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: 'artifacts/AgentHubPreview.app',
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: iosScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain('iOS QA report appPath must be an absolute path.');
        expect(result.ios.appVerified).toBe(false);
    });

    it('fails when iOS completed evidence references screenshots outside the artifacts directory', () => {
        const artifactsDir = makeArtifactsDir();
        const outsideDir = mkdtempSync(join(tmpdir(), 'agenthub-native-qa-outside-'));
        const androidTimestamp = '20260705-0520';
        const iosTimestamp = '20260705-0746';
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const iosAppPath = join(repoRoot, 'artifacts', 'AgentHubPreview.app');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        const outsideScreenshot = join(outsideDir, `agenthub-v02-ios-modal-${iosTimestamp}.png`);
        const iosScreenshots = [
            {
                name: 'launch',
                path: join(artifactsDir, `agenthub-v02-ios-launch-${iosTimestamp}.png`),
            },
            {
                name: 'modal',
                path: outsideScreenshot,
            },
            ...['prompt-keyboard', 'long-content'].map((name) => ({
                name,
                path: join(artifactsDir, `agenthub-v02-ios-${name}-${iosTimestamp}.png`),
            })),
        ];

        writeApk(arm64ApkPath);
        mkdirSync(iosAppPath, { recursive: true });
        writePng(outsideScreenshot);
        for (const screenshot of [...androidScreenshots, iosScreenshots[0], ...iosScreenshots.slice(2)]) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeJson(join(artifactsDir, `agenthub-v02-ios-native-qa-${iosTimestamp}.json`), {
            status: 'completed',
            appPath: iosAppPath,
            bundleIdentifier: 'com.artsum.agenthub',
            screenshots: iosScreenshots,
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain(`iOS QA screenshot modal is outside artifacts dir: ${outsideScreenshot}`);
    });

    it('derives the handoff path from the provided repository root', () => {
        const artifactsDir = makeArtifactsDir();
        const alternateRepoRoot = join(tmpdir(), 'agenthub worktree');

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot: alternateRepoRoot });

        expect(result.repoRoot).toBe(alternateRepoRoot);
        expect(result.artifactsDir).toBe(artifactsDir);
        expect(result.handoffPath).toBe(join(alternateRepoRoot, 'docs', 'agenthub-v02-native-qa-handoff.md'));
        expect(result.nextActions).toEqual([
            {
                platform: 'android',
                reason: 'Run Android native QA on an arm64 device with the delivery APK.',
                command: androidQaCommand,
                fallbackCommand: androidFallbackCommand,
            },
            {
                platform: 'ios',
                reason: 'Run iOS native QA from macOS with Xcode simctl and an AgentHubPreview.app artifact.',
                command: iosQaCommand(alternateRepoRoot),
                fallbackCommand: iosFallbackCommand(alternateRepoRoot),
            },
        ]);
        expect(formatNativeQaEvidenceMarkdown(result)).toContain(
            `- Native QA handoff: \`${join(alternateRepoRoot, 'docs', 'agenthub-v02-native-qa-handoff.md')}\``,
        );
    });

    it('keeps rerun commands visible when Android evidence is missing', () => {
        const artifactsDir = makeArtifactsDir();

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toContain('Missing Android native QA report.');
        expect(result.nextActions).toEqual([
            {
                platform: 'android',
                reason: 'Run Android native QA on an arm64 device with the delivery APK.',
                command: androidQaCommand,
                fallbackCommand: androidFallbackCommand,
            },
            {
                platform: 'ios',
                reason: 'Run iOS native QA from macOS with Xcode simctl and an AgentHubPreview.app artifact.',
                command: iosQaCommand(repoRoot),
                fallbackCommand: iosFallbackCommand(repoRoot),
            },
        ]);
    });

    it('keeps rerun commands visible when platform evidence failed', () => {
        const artifactsDir = makeArtifactsDir();
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeJson(join(artifactsDir, 'agenthub-v02-android-native-qa-20260705-0700.json'), {
            status: 'failed',
            reason: 'install APK failed',
            packageName: 'com.artsum.agenthub',
        });
        writeJson(join(artifactsDir, 'agenthub-v02-ios-native-qa-20260705-0700.json'), {
            status: 'failed',
            reason: 'launch failed',
            bundleIdentifier: 'com.artsum.agenthub',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.failures).toEqual([
            'Android native QA failed: install APK failed',
            'iOS native QA failed: launch failed',
        ]);
        expect(result.nextActions).toEqual([
            {
                platform: 'android',
                reason: 'Resolve Android native QA failure: install APK failed. Then rerun on an arm64 device.',
                command: androidQaCommand,
                fallbackCommand: androidFallbackCommand,
            },
            {
                platform: 'ios',
                reason: 'Resolve iOS native QA failure: launch failed. Then rerun from macOS with Xcode simctl.',
                command: iosQaCommand(repoRoot),
                fallbackCommand: iosFallbackCommand(repoRoot),
            },
        ]);
    });

    it('fails with a clear reason when an Android report omits status', () => {
        const artifactsDir = makeArtifactsDir();
        const reportPath = join(artifactsDir, 'agenthub-v02-android-native-qa-20260705-0705.json');
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeJson(reportPath, {
            packageName: 'com.artsum.agenthub',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.android.reason).toBe('report status was missing or invalid');
        expect(result.failures).toContain('Android native QA failed: report status was missing or invalid');
        expect(result.nextActions[0]).toEqual({
            platform: 'android',
            reason: 'Resolve Android native QA failure: report status was missing or invalid. Then rerun on an arm64 device.',
            command: androidQaCommand,
            fallbackCommand: androidFallbackCommand,
        });
    });

    it('fails with a clear reason when an iOS report has a non-string status', () => {
        const artifactsDir = makeArtifactsDir();
        const reportPath = join(artifactsDir, 'agenthub-v02-ios-native-qa-20260705-0705.json');
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeJson(join(artifactsDir, 'agenthub-v02-android-native-qa-20260705-0705.json'), {
            status: 'blocked',
            reason: 'no ready Android device',
            packageName: 'com.artsum.agenthub',
        });
        writeJson(reportPath, {
            status: 1,
            bundleIdentifier: 'com.artsum.agenthub',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.ios.reason).toBe('report status was missing or invalid');
        expect(result.failures).toContain('iOS native QA failed: report status was missing or invalid');
        expect(result.nextActions[1]).toEqual({
            platform: 'ios',
            reason: 'Resolve iOS native QA failure: report status was missing or invalid. Then rerun from macOS with Xcode simctl.',
            command: iosQaCommand(repoRoot),
            fallbackCommand: iosFallbackCommand(repoRoot),
        });
    });

    it('fails with rerun guidance instead of throwing when the latest Android report is not parseable JSON', () => {
        const artifactsDir = makeArtifactsDir();
        const reportPath = join(artifactsDir, 'agenthub-v02-android-native-qa-20260705-0710.json');
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeFileSync(reportPath, '{not-json');
        writeJson(join(artifactsDir, 'agenthub-v02-ios-native-qa-20260705-0710.json'), {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            bundleIdentifier: 'com.artsum.agenthub',
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        });

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.android).toEqual({
            status: 'failed',
            reportPath,
            reason: 'report JSON was not parseable',
        });
        expect(result.failures).toContain('Android native QA failed: report JSON was not parseable');
        expect(result.nextActions[0]).toEqual({
            platform: 'android',
            reason: 'Resolve Android native QA failure: report JSON was not parseable. Then rerun on an arm64 device.',
            command: androidQaCommand,
            fallbackCommand: androidFallbackCommand,
        });
    });

    it('fails with rerun guidance instead of throwing when the latest iOS report is not parseable JSON', () => {
        const artifactsDir = makeArtifactsDir();
        const androidTimestamp = '20260705-0720';
        const reportPath = join(artifactsDir, 'agenthub-v02-ios-native-qa-20260705-0720.json');
        const arm64ApkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        const androidScreenshots = ['launch', 'modal', 'prompt-keyboard', 'long-content'].map((name) => ({
            name,
            path: join(artifactsDir, `agenthub-v02-android-${name}-${androidTimestamp}.png`),
        }));
        writeApk(arm64ApkPath);
        for (const screenshot of androidScreenshots) {
            writePng(screenshot.path);
        }
        writeJson(join(artifactsDir, `agenthub-v02-android-native-qa-${androidTimestamp}.json`), {
            status: 'completed',
            qaProfile: 'production-smoke',
            semanticReady: true,
            apkPath: arm64ApkPath,
            packageName: 'com.artsum.agenthub',
            device: { abi: 'arm64-v8a' },
            screenshots: androidScreenshots,
        });
        writeFileSync(reportPath, '{not-json');

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.ios).toEqual({
            status: 'failed',
            reportPath,
            reason: 'report JSON was not parseable',
        });
        expect(result.failures).toContain('iOS native QA failed: report JSON was not parseable');
        expect(result.nextActions).toEqual([
            {
                platform: 'ios',
                reason: 'Resolve iOS native QA failure: report JSON was not parseable. Then rerun from macOS with Xcode simctl.',
                command: iosQaCommand(repoRoot),
                fallbackCommand: iosFallbackCommand(repoRoot),
            },
        ]);
    });

    it('fails with a clear reason when the latest platform report JSON is not an object', () => {
        const artifactsDir = makeArtifactsDir();
        const reportPath = join(artifactsDir, 'agenthub-v02-ios-native-qa-20260705-0730.json');
        writeApk(join(artifactsDir, 'agenthub-production-arm64-latest.apk'));
        writeJson(join(artifactsDir, 'agenthub-v02-android-native-qa-20260705-0730.json'), {
            status: 'blocked',
            reason: 'no ready Android device',
            packageName: 'com.artsum.agenthub',
            nextAction: 'Connect an arm64 Android device with USB debugging enabled, confirm `adb devices -l` lists it as `device`, then rerun agenthub:native:android.',
        });
        writeFileSync(reportPath, '[]');

        const result = auditNativeQaEvidence({ artifactsDir, repoRoot });

        expect(result.status).toBe('failed');
        expect(result.ios).toEqual({
            status: 'failed',
            reportPath,
            reason: 'report JSON was not an object',
        });
        expect(result.failures).toContain('iOS native QA failed: report JSON was not an object');
        expect(result.nextActions[1]).toEqual({
            platform: 'ios',
            reason: 'Resolve iOS native QA failure: report JSON was not an object. Then rerun from macOS with Xcode simctl.',
            command: iosQaCommand(repoRoot),
            fallbackCommand: iosFallbackCommand(repoRoot),
        });
    });
});
