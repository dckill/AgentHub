import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

function makeArtifactsDir() {
    return mkdtempSync(join(tmpdir(), 'agenthub-android-native-qa-'));
}

describe('AgentHub Android native QA CLI', () => {
    it('fails closed when adb commands succeed but AgentHub records an ANR', () => {
        const artifactsDir = makeArtifactsDir();
        const androidHome = join(artifactsDir, 'Android', 'Sdk');
        const adbPath = join(androidHome, 'platform-tools', 'adb');
        const apkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        mkdirSync(join(androidHome, 'platform-tools'), { recursive: true });
        writeFileSync(apkPath, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
        writeFileSync(adbPath, `#!/usr/bin/env node
const args = process.argv.slice(2).join(' ');
if (args === 'devices -l') process.stdout.write('List of devices attached\\nR5CW000000A device usb:1-1\\n');
else if (args.includes('getprop ro.product.cpu.abi')) process.stdout.write('arm64-v8a\\n');
else if (args.includes('dumpsys activity activities')) process.stdout.write('mResumedActivity: com.artsum.agenthub/.MainActivity\\n');
else if (args.includes('uiautomator dump')) process.stdout.write('<node text="AgentHub Simple Alert Rename workspace Code Surfaces" />\\n');
else if (args.includes('exec-out screencap -p')) process.stdout.write(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
else if (args.includes('logcat -d -t 300')) process.stdout.write('ANR in com.artsum.agenthub (com.artsum.agenthub/.MainActivity)\\n');
process.exit(0);
`);
        chmodSync(adbPath, 0o755);

        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-android-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                ANDROID_SERIAL: 'R5CW000000A',
                AGENTHUB_ANDROID_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_ANDROID_APK: apkPath,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(1);
        const report = JSON.parse(result.stdout) as { qaProfile: string; status: string; reason: string; steps: Array<{ label: string }> };
        expect(report.qaProfile).toBe('production-smoke');
        expect(report.status).toBe('failed');
        expect(report.reason).toBe('collect logcat tail failed: forbidden output ANR in com.artsum.agenthub');
        expect(report.steps.at(-1)?.label).toBe('collect logcat tail');
    }, 30_000);

    it('blocks preview visual QA when the production package is supplied', () => {
        const artifactsDir = makeArtifactsDir();
        const androidHome = join(artifactsDir, 'Android', 'Sdk');
        const adbPath = join(androidHome, 'platform-tools', 'adb');
        const apkPath = join(artifactsDir, 'agenthub-preview-arm64-latest.apk');
        mkdirSync(join(androidHome, 'platform-tools'), { recursive: true });
        writeFileSync(apkPath, Buffer.from([0x50, 0x4b, 0x03, 0x04]));
        symlinkSync(process.execPath, adbPath);

        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-android-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                AGENTHUB_ANDROID_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_ANDROID_APK: apkPath,
                AGENTHUB_ANDROID_QA_PROFILE: 'preview-visual',
                AGENTHUB_ANDROID_PACKAGE: 'com.artsum.agenthub',
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as { qaProfile: string; reason: string };
        expect(report.qaProfile).toBe('preview-visual');
        expect(report.reason).toBe('QA profile/package mismatch');
    });

    it('blocks with an explicit ANDROID_HOME setup reason before looking for adb', () => {
        const artifactsDir = makeArtifactsDir();
        const env = { ...process.env };
        delete env.ANDROID_HOME;
        delete env.ANDROID_SERIAL;
        delete env.AGENTHUB_ANDROID_DEVICE;

        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-android-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...env,
                AGENTHUB_ANDROID_QA_ARTIFACTS_DIR: artifactsDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('"reason": "ANDROID_HOME not set"');
        expect(result.stdout).not.toContain('"reason": "adb not found"');

        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            androidHome?: string;
            nextAction?: string;
        };
        expect(report.reportPath).toContain(artifactsDir);
        expect(report.reason).toBe('ANDROID_HOME not set');
        expect(report.androidHome).toBeUndefined();
        expect(report.nextAction).toBe('Set ANDROID_HOME to the Android SDK root, then rerun agenthub:native:android.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.reason).toBe('ANDROID_HOME not set');
    });

    it('blocks with an actionable adb setup reason when platform tools are missing', () => {
        const artifactsDir = makeArtifactsDir();
        const androidHome = join(artifactsDir, 'Android', 'Sdk');

        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-android-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                AGENTHUB_ANDROID_QA_ARTIFACTS_DIR: artifactsDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('adb not found');
        expect(report.nextAction).toBe('Install Android SDK platform-tools or set ANDROID_HOME to the SDK root containing platform-tools/adb.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('blocks with an actionable APK setup reason when the delivery APK is missing', () => {
        const artifactsDir = makeArtifactsDir();
        const androidHome = join(artifactsDir, 'Android', 'Sdk');
        const adbPath = join(androidHome, 'platform-tools', 'adb');
        mkdirSync(join(androidHome, 'platform-tools'), { recursive: true });
        symlinkSync(process.execPath, adbPath);

        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-android-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                AGENTHUB_ANDROID_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_ANDROID_APK: join(artifactsDir, 'missing.apk'),
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('APK not found');
        expect(report.nextAction).toBe('Build or copy the Android arm64 delivery APK into artifacts/, then rerun agenthub:native:android.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('blocks with an actionable APK artifact reason when the delivery APK path is a directory', () => {
        const artifactsDir = makeArtifactsDir();
        const androidHome = join(artifactsDir, 'Android', 'Sdk');
        const adbPath = join(androidHome, 'platform-tools', 'adb');
        const apkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        mkdirSync(join(androidHome, 'platform-tools'), { recursive: true });
        mkdirSync(apkPath, { recursive: true });
        symlinkSync(process.execPath, adbPath);

        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-android-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                AGENTHUB_ANDROID_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_ANDROID_APK: apkPath,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('APK path is not a file');
        expect(report.nextAction).toBe('Build or copy a file APK into artifacts/, then rerun agenthub:native:android.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('blocks with an actionable APK artifact reason when the delivery APK is outside artifacts', () => {
        const artifactsDir = makeArtifactsDir();
        const outsideDir = makeArtifactsDir();
        const androidHome = join(artifactsDir, 'Android', 'Sdk');
        const adbPath = join(androidHome, 'platform-tools', 'adb');
        const apkPath = join(outsideDir, 'outside.apk');
        mkdirSync(join(androidHome, 'platform-tools'), { recursive: true });
        writeFileSync(apkPath, 'apk');
        symlinkSync(process.execPath, adbPath);

        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-android-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                AGENTHUB_ANDROID_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_ANDROID_APK: apkPath,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('APK path is outside artifacts');
        expect(report.nextAction).toBe('Build or copy the Android APK into the active artifacts/ directory, then rerun agenthub:native:android.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('blocks with an actionable APK artifact reason when the delivery APK is not a valid APK or ZIP', () => {
        const artifactsDir = makeArtifactsDir();
        const androidHome = join(artifactsDir, 'Android', 'Sdk');
        const adbPath = join(androidHome, 'platform-tools', 'adb');
        const apkPath = join(artifactsDir, 'agenthub-production-arm64-latest.apk');
        mkdirSync(join(androidHome, 'platform-tools'), { recursive: true });
        writeFileSync(apkPath, 'not-an-apk');
        symlinkSync(process.execPath, adbPath);

        const result = spawnSync('node', [resolve(repoRoot, 'scripts/agenthub-android-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                ANDROID_HOME: androidHome,
                AGENTHUB_ANDROID_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_ANDROID_APK: apkPath,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('APK path is not a valid APK/ZIP artifact');
        expect(report.nextAction).toBe('Build or copy a valid APK file into artifacts/, then rerun agenthub:native:android.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });
});
