import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(__dirname, '../../../..');

function makeArtifactsDir() {
    return mkdtempSync(join(tmpdir(), 'agenthub-ios-native-qa-'));
}

describe('AgentHub iOS native QA CLI', () => {
    it('blocks after automated launch checks when the independent iOS security matrix evidence is missing', () => {
        const artifactsDir = makeArtifactsDir();
        const binDir = join(artifactsDir, 'bin');
        const appPath = join(artifactsDir, 'AgentHubPreview.app');
        mkdirSync(binDir);
        mkdirSync(appPath, { recursive: true });
        symlinkSync(process.execPath, join(binDir, 'node'));
        writeFileSync(
            join(appPath, 'Info.plist'),
            '<plist><dict><key>CFBundleIdentifier</key><string>com.artsum.agenthub</string></dict></plist>\n',
        );
        const xcrunPath = join(binDir, 'xcrun');
        writeFileSync(
            xcrunPath,
            [
                '#!/usr/bin/env node',
                "if (process.argv[2] === '--find' && process.argv[3] === 'simctl') {",
                "  console.log('/Applications/Xcode.app/Contents/Developer/usr/bin/simctl');",
                '  process.exit(0);',
                '}',
                "if (process.argv[2] === 'simctl' && process.argv[3] === 'list') {",
                "  console.log(JSON.stringify({ devices: { 'com.apple.CoreSimulator.SimRuntime.iOS-18-5': [{ name: 'iPhone 16 Pro', udid: 'IOS-DEVICE-1', state: 'Booted' }] } }));",
                '  process.exit(0);',
                '}',
                "if (process.argv[2] === 'simctl' && process.argv[3] === 'io') {",
                "  process.stdout.write('fake-png');",
                '  process.exit(0);',
                '}',
                "if (process.argv[2] === 'simctl' && process.argv[3] === 'spawn') {",
                "  process.stdout.write('fake-log');",
                '  process.exit(0);',
                '}',
                'process.exit(0);',
                '',
            ].join('\n'),
            { mode: 0o755 },
        );

        const result = spawnSync(process.execPath, [resolve(repoRoot, 'scripts/agenthub-ios-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                AGENTHUB_IOS_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_IOS_APP: appPath,
                PATH: binDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            status: string;
            reason: string;
            verificationMode?: string;
            automationStatus?: string;
            securityEvidencePath?: string;
        };
        expect(report).toMatchObject({
            status: 'blocked',
            reason: 'iOS security QA evidence is missing',
            verificationMode: 'automated-contract',
            automationStatus: 'completed',
            securityEvidencePath: join(artifactsDir, 'agenthub-ios-security-qa-latest.json'),
        });
    }, 30_000);

    it('blocks with an actionable Xcode simctl setup reason when xcrun is unavailable', () => {
        const artifactsDir = makeArtifactsDir();
        const binDir = join(artifactsDir, 'bin');
        mkdirSync(binDir);
        symlinkSync(process.execPath, join(binDir, 'node'));

        const result = spawnSync(process.execPath, [resolve(repoRoot, 'scripts/agenthub-ios-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                AGENTHUB_IOS_QA_ARTIFACTS_DIR: artifactsDir,
                PATH: binDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        expect(result.stderr).toBe('');
        expect(result.stdout).toContain('"reason": "xcrun simctl not found"');

        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reportPath).toContain(artifactsDir);
        expect(report.reason).toBe('xcrun simctl not found');
        expect(report.nextAction).toBe('Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('blocks with an actionable app artifact reason when simctl exists but the app is missing', () => {
        const artifactsDir = makeArtifactsDir();
        const binDir = join(artifactsDir, 'bin');
        mkdirSync(binDir);
        symlinkSync(process.execPath, join(binDir, 'node'));
        const xcrunPath = join(binDir, 'xcrun');
        writeFileSync(
            xcrunPath,
            [
                '#!/usr/bin/env node',
                "if (process.argv[2] === '--find' && process.argv[3] === 'simctl') {",
                "  console.log('/Applications/Xcode.app/Contents/Developer/usr/bin/simctl');",
                '  process.exit(0);',
                '}',
                'process.exit(1);',
                '',
            ].join('\n'),
            { mode: 0o755 },
        );

        const result = spawnSync(process.execPath, [resolve(repoRoot, 'scripts/agenthub-ios-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                AGENTHUB_IOS_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_IOS_APP: join(artifactsDir, 'missing-AgentHubPreview.app'),
                PATH: binDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('iOS .app not found');
        expect(report.nextAction).toBe('Build or copy AgentHubPreview.app into artifacts/, set AGENTHUB_IOS_APP if needed, then rerun agenthub:native:ios.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('blocks with an actionable app artifact reason when the app path is not a directory', () => {
        const artifactsDir = makeArtifactsDir();
        const binDir = join(artifactsDir, 'bin');
        const appPath = join(artifactsDir, 'AgentHubPreview.app');
        mkdirSync(binDir);
        symlinkSync(process.execPath, join(binDir, 'node'));
        writeFileSync(appPath, 'not-a-directory');
        const xcrunPath = join(binDir, 'xcrun');
        writeFileSync(
            xcrunPath,
            [
                '#!/usr/bin/env node',
                "if (process.argv[2] === '--find' && process.argv[3] === 'simctl') {",
                "  console.log('/Applications/Xcode.app/Contents/Developer/usr/bin/simctl');",
                '  process.exit(0);',
                '}',
                'process.exit(1);',
                '',
            ].join('\n'),
            { mode: 0o755 },
        );

        const result = spawnSync(process.execPath, [resolve(repoRoot, 'scripts/agenthub-ios-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                AGENTHUB_IOS_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_IOS_APP: appPath,
                PATH: binDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('iOS .app path is not a directory');
        expect(report.nextAction).toBe('Build or copy an AgentHubPreview.app directory into artifacts/, set AGENTHUB_IOS_APP if needed, then rerun agenthub:native:ios.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('blocks with an actionable app artifact reason when the app path is outside artifacts', () => {
        const artifactsDir = makeArtifactsDir();
        const outsideDir = makeArtifactsDir();
        const binDir = join(artifactsDir, 'bin');
        const appPath = join(outsideDir, 'AgentHubPreview.app');
        mkdirSync(binDir);
        mkdirSync(appPath, { recursive: true });
        symlinkSync(process.execPath, join(binDir, 'node'));
        const xcrunPath = join(binDir, 'xcrun');
        writeFileSync(
            xcrunPath,
            [
                '#!/usr/bin/env node',
                "if (process.argv[2] === '--find' && process.argv[3] === 'simctl') {",
                "  console.log('/Applications/Xcode.app/Contents/Developer/usr/bin/simctl');",
                '  process.exit(0);',
                '}',
                'process.exit(1);',
                '',
            ].join('\n'),
            { mode: 0o755 },
        );

        const result = spawnSync(process.execPath, [resolve(repoRoot, 'scripts/agenthub-ios-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                AGENTHUB_IOS_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_IOS_APP: appPath,
                PATH: binDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('iOS .app path is outside artifacts');
        expect(report.nextAction).toBe('Build or copy AgentHubPreview.app into the active artifacts/ directory, set AGENTHUB_IOS_APP if needed, then rerun agenthub:native:ios.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('blocks with an actionable app artifact reason when the app bundle identifier is wrong', () => {
        const artifactsDir = makeArtifactsDir();
        const binDir = join(artifactsDir, 'bin');
        const appPath = join(artifactsDir, 'AgentHubPreview.app');
        mkdirSync(binDir);
        mkdirSync(appPath, { recursive: true });
        symlinkSync(process.execPath, join(binDir, 'node'));
        writeFileSync(
            join(appPath, 'Info.plist'),
            [
                '<?xml version="1.0" encoding="UTF-8"?>',
                '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
                '<plist version="1.0">',
                '<dict>',
                '<key>CFBundleIdentifier</key>',
                '<string>com.example.wrong</string>',
                '</dict>',
                '</plist>',
                '',
            ].join('\n'),
        );
        const xcrunPath = join(binDir, 'xcrun');
        writeFileSync(
            xcrunPath,
            [
                '#!/usr/bin/env node',
                "if (process.argv[2] === '--find' && process.argv[3] === 'simctl') {",
                "  console.log('/Applications/Xcode.app/Contents/Developer/usr/bin/simctl');",
                '  process.exit(0);',
                '}',
                'process.exit(1);',
                '',
            ].join('\n'),
            { mode: 0o755 },
        );

        const result = spawnSync(process.execPath, [resolve(repoRoot, 'scripts/agenthub-ios-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                AGENTHUB_IOS_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_IOS_APP: appPath,
                PATH: binDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            appBundleIdentifier?: string;
            nextAction?: string;
        };
        expect(report.reason).toBe('iOS .app bundle identifier mismatch');
        expect(report.appBundleIdentifier).toBe('com.example.wrong');
        expect(report.nextAction).toBe('Build or copy AgentHubPreview.app with bundle id com.artsum.agenthub into artifacts/, then rerun agenthub:native:ios.');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.nextAction).toBe(report.nextAction);
    });

    it('accepts a binary Info.plist with the expected app bundle identifier before querying simulators', () => {
        const artifactsDir = makeArtifactsDir();
        const binDir = join(artifactsDir, 'bin');
        const appPath = join(artifactsDir, 'AgentHubPreview.app');
        mkdirSync(binDir);
        mkdirSync(appPath, { recursive: true });
        symlinkSync(process.execPath, join(binDir, 'node'));
        writeFileSync(
            join(appPath, 'Info.plist'),
            Buffer.from(
                'YnBsaXN0MDDRAQJfEBJDRkJ1bmRsZUlkZW50aWZpZXJfEBNjb20uYXJ0c3VtLmFnZW50aHViCAsgAAAAAAAAAQEAAAAAAAAAAwAAAAAAAAAAAAAAAAAAADY=',
                'base64',
            ),
        );
        const xcrunPath = join(binDir, 'xcrun');
        writeFileSync(
            xcrunPath,
            [
                '#!/usr/bin/env node',
                "if (process.argv[2] === '--find' && process.argv[3] === 'simctl') {",
                "  console.log('/Applications/Xcode.app/Contents/Developer/usr/bin/simctl');",
                '  process.exit(0);',
                '}',
                'process.stderr.write("simctl query reached");',
                'process.exit(1);',
                '',
            ].join('\n'),
            { mode: 0o755 },
        );

        const result = spawnSync(process.execPath, [resolve(repoRoot, 'scripts/agenthub-ios-native-qa.mjs')], {
            cwd: resolve(repoRoot, 'packages/agenthub-app'),
            encoding: 'utf8',
            env: {
                ...process.env,
                AGENTHUB_IOS_QA_ARTIFACTS_DIR: artifactsDir,
                AGENTHUB_IOS_APP: appPath,
                PATH: binDir,
            },
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        expect(result.status).toBe(2);
        const report = JSON.parse(result.stdout) as {
            reportPath: string;
            reason: string;
            stderr?: string;
        };
        expect(report.reason).toBe('simctl booted devices query failed');
        expect(report.stderr).toBe('simctl query reached');

        const persistedReport = JSON.parse(readFileSync(report.reportPath, 'utf8')) as typeof report;
        expect(persistedReport.reason).toBe(report.reason);
    });
});
