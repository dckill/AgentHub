#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveAndroidApkPath } from './androidApkPath.mjs';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const apkPath = resolveAndroidApkPath(process.argv[2], process.cwd(), repoRoot);
const androidHome = process.env.ANDROID_HOME || join(homedir(), 'Android', 'Sdk');
const buildToolsDir = pickLatestBuildTools(androidHome);
const aapt = join(buildToolsDir, 'aapt');
const apksigner = join(buildToolsDir, 'apksigner');
const adb = join(androidHome, 'platform-tools', 'adb');

function pickLatestBuildTools(root) {
    const dir = join(root, 'build-tools');
    if (!existsSync(dir)) {
        fail(`Android build-tools directory not found: ${dir}`);
    }
    const versions = readdirSync(dir)
        .filter((entry) => existsSync(join(dir, entry, 'aapt')) && existsSync(join(dir, entry, 'apksigner')))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (versions.length === 0) {
        fail(`No usable Android build-tools found under ${dir}`);
    }
    return join(dir, versions[versions.length - 1]);
}

function run(command, args, options = {}) {
    try {
        return execFileSync(command, args, {
            cwd: repoRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            ...options,
        });
    } catch (error) {
        const stderr = error.stderr ? String(error.stderr) : '';
        const stdout = error.stdout ? String(error.stdout) : '';
        fail(`${command} ${args.join(' ')} failed\n${stdout}${stderr}`);
    }
}

function tryRun(command, args) {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        status: result.status,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

function fail(message) {
    console.error(message);
    process.exit(1);
}

function requireMatch(text, pattern, message) {
    const match = text.match(pattern);
    if (!match) {
        fail(message);
    }
    return match;
}

if (!existsSync(apkPath)) {
    fail(`APK not found: ${apkPath}`);
}

for (const tool of [aapt, apksigner]) {
    if (!existsSync(tool)) {
        fail(`Required Android tool not found: ${tool}`);
    }
}

const badging = run(aapt, ['dump', 'badging', apkPath]);
const packageName = requireMatch(badging, /package: name='([^']+)'/, 'Missing package name in APK badging')[1];
const versionName = requireMatch(badging, /versionName='([^']+)'/, 'Missing versionName in APK badging')[1];
const label = requireMatch(badging, /application-label:'([^']+)'/, 'Missing application label in APK badging')[1];
const nativeCode = requireMatch(badging, /native-code: '([^']+)'/, 'Missing native-code in APK badging')[1];
const targetSdk = requireMatch(badging, /targetSdkVersion:'([^']+)'/, 'Missing targetSdkVersion in APK badging')[1];
const minSdk = requireMatch(badging, /sdkVersion:'([^']+)'/, 'Missing sdkVersion in APK badging')[1];

const expected = {
    packageName: 'com.artsum.agenthub',
    versionName: '1.0.0',
    label: 'AgentHub',
    nativeCode: 'arm64-v8a',
};

if (packageName !== expected.packageName) {
    fail(`Unexpected package name: ${packageName}`);
}
if (versionName !== expected.versionName) {
    fail(`Unexpected versionName: ${versionName}`);
}
if (label !== expected.label) {
    fail(`Unexpected application label: ${label}`);
}
if (nativeCode !== expected.nativeCode) {
    fail(`Unexpected native-code: ${nativeCode}`);
}

const signature = run(apksigner, ['verify', '--verbose', '--print-certs', apkPath]);
if (!signature.includes('Verifies')) {
    fail('APK signature verification did not report "Verifies"');
}
if (!signature.includes('Verified using v2 scheme (APK Signature Scheme v2): true')) {
    fail('APK is not verified with signature scheme v2');
}

const zipTest = tryRun('unzip', ['-t', apkPath]);
if (zipTest.status !== 0 || !zipTest.stdout.includes('No errors detected')) {
    fail(`APK zip integrity failed\n${zipTest.stdout}${zipTest.stderr}`);
}

const zipList = run('unzip', ['-l', apkPath]);
for (const entry of ['assets/index.android.bundle', 'AndroidManifest.xml', 'lib/arm64-v8a/libreactnative.so']) {
    if (!zipList.includes(entry)) {
        fail(`APK is missing required entry: ${entry}`);
    }
}

const devices = existsSync(adb) ? tryRun(adb, ['devices', '-l']) : { status: null, stdout: '', stderr: 'adb not found' };
const connectedDevices = devices.stdout
    .split('\n')
    .slice(1)
    .map((line) => line.trim())
    .filter((line) => line && !line.includes('offline'));

const report = {
    apkPath,
    sizeBytes: statSync(apkPath).size,
    androidHome,
    buildToolsDir,
    packageName,
    versionName,
    label,
    minSdk,
    targetSdk,
    nativeCode,
    signatureSchemeV2: true,
    zipIntegrity: true,
    requiredEntriesPresent: true,
    adbAvailable: existsSync(adb),
    connectedDeviceCount: connectedDevices.length,
    connectedDevices,
};

console.log(JSON.stringify(report, null, 2));
