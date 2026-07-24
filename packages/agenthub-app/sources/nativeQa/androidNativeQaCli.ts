import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join, relative } from 'node:path';
import {
    buildAndroidNativeQaPlan,
    getPreferredAndroidDevice,
    parseAdbDevices,
    type AndroidNativeQaProfile,
    type AndroidQaCommand,
} from './androidNativeQaPlan';

const repoRoot = process.cwd();
const configuredAndroidHome = process.env.ANDROID_HOME;
const androidHome = configuredAndroidHome || join(homedir(), 'Android', 'Sdk');
const adb = join(androidHome, 'platform-tools', 'adb');
const outputDir = process.env.AGENTHUB_ANDROID_QA_ARTIFACTS_DIR || join(repoRoot, 'artifacts');
const rawQaProfile = process.env.AGENTHUB_ANDROID_QA_PROFILE || 'production-smoke';
const qaProfile = rawQaProfile as AndroidNativeQaProfile;
const defaultPackageName = qaProfile === 'preview-visual' ? 'com.artsum.agenthub.preview' : 'com.artsum.agenthub';
const packageName = process.env.AGENTHUB_ANDROID_PACKAGE || defaultPackageName;
const apkPath =
    process.env.AGENTHUB_ANDROID_APK ||
    join(outputDir, qaProfile === 'preview-visual' ? 'agenthub-preview-arm64-latest.apk' : 'agenthub-production-arm64-latest.apk');
const requestedDeviceId = process.env.ANDROID_SERIAL || process.env.AGENTHUB_ANDROID_DEVICE;
const timestamp = makeTimestamp(new Date());

type CommandResult = {
    status: number;
    stdout: string | Buffer;
    stderr: string | Buffer;
};

function makeTimestamp(date: Date) {
    const pad = (value: number) => String(value).padStart(2, '0');
    return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}

function run(command: string, args: string[], options: { encoding?: BufferEncoding | 'buffer' } = {}): CommandResult {
    const result = spawnSync(command, args, {
        cwd: repoRoot,
        encoding: options.encoding === 'buffer' ? 'buffer' : (options.encoding ?? 'utf8'),
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return {
        status: result.status ?? 1,
        stdout: result.stdout || '',
        stderr: result.stderr || '',
    };
}

function runCommandStep(step: AndroidQaCommand) {
    if (step.executable === 'sleep') {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(step.args[0]) * 1000);
        return { status: 0, stdout: '', stderr: '' };
    }

    const result = run(adb, step.args, { encoding: step.outputPath ? 'buffer' : 'utf8' });
    if (step.outputPath && result.status === 0) {
        writeFileSync(step.outputPath, result.stdout);
    }
    return result;
}

function normalizeStderr(stderr: string | Buffer) {
    return Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : stderr.trim();
}

function normalizeStdout(stdout: string | Buffer) {
    return Buffer.isBuffer(stdout) ? stdout.toString('utf8') : stdout;
}

function isFile(path: string) {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

function hasZipSignature(path: string) {
    try {
        const signature = readFileSync(path).subarray(0, 4);
        return signature.equals(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    } catch {
        return false;
    }
}

function isPathInsideDirectory(path: string, directory: string) {
    if (!isAbsolute(path)) {
        return false;
    }
    const relativePath = relative(directory, path);
    return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

function writeReport(report: Record<string, unknown>, status: number): never {
    mkdirSync(outputDir, { recursive: true });
    const reportName = qaProfile === 'preview-visual'
        ? `agenthub-v02-android-preview-native-qa-${timestamp}.json`
        : `agenthub-v02-android-native-qa-${timestamp}.json`;
    const reportPath = join(outputDir, reportName);
    const profiledReport = { qaProfile, verificationMode: 'automated-contract', ...report };
    writeFileSync(reportPath, `${JSON.stringify(profiledReport, null, 2)}\n`);
    console.log(JSON.stringify({ ...profiledReport, reportPath }, null, 2));
    process.exit(status);
}

if (qaProfile !== 'production-smoke' && qaProfile !== 'preview-visual') {
    writeReport(
        {
            status: 'blocked',
            reason: 'Unsupported Android QA profile',
            requestedQaProfile: rawQaProfile,
            nextAction: 'Use AGENTHUB_ANDROID_QA_PROFILE=production-smoke or preview-visual.',
        },
        2,
    );
}

if (packageName !== defaultPackageName) {
    writeReport(
        {
            status: 'blocked',
            reason: 'QA profile/package mismatch',
            packageName,
            expectedPackageName: defaultPackageName,
            nextAction: `Use ${defaultPackageName} with the ${qaProfile} profile.`,
        },
        2,
    );
}

if (!configuredAndroidHome) {
    writeReport(
        {
            status: 'blocked',
            reason: 'ANDROID_HOME not set',
            adb,
            apkPath,
            packageName,
            nextAction: 'Set ANDROID_HOME to the Android SDK root, then rerun agenthub:native:android.',
        },
        2,
    );
}

if (!existsSync(adb)) {
    writeReport(
        {
            status: 'blocked',
            reason: 'adb not found',
            androidHome,
            adb,
            apkPath,
            packageName,
            nextAction: 'Install Android SDK platform-tools or set ANDROID_HOME to the SDK root containing platform-tools/adb.',
        },
        2,
    );
}

if (!existsSync(apkPath)) {
    writeReport(
        {
            status: 'blocked',
            reason: 'APK not found',
            androidHome,
            adb,
            apkPath,
            packageName,
            nextAction: 'Build or copy the Android arm64 delivery APK into artifacts/, then rerun agenthub:native:android.',
        },
        2,
    );
}

if (!isPathInsideDirectory(apkPath, outputDir)) {
    writeReport(
        {
            status: 'blocked',
            reason: 'APK path is outside artifacts',
            androidHome,
            adb,
            apkPath,
            packageName,
            nextAction: 'Build or copy the Android APK into the active artifacts/ directory, then rerun agenthub:native:android.',
        },
        2,
    );
}

if (!isFile(apkPath)) {
    writeReport(
        {
            status: 'blocked',
            reason: 'APK path is not a file',
            androidHome,
            adb,
            apkPath,
            packageName,
            nextAction: 'Build or copy a file APK into artifacts/, then rerun agenthub:native:android.',
        },
        2,
    );
}

if (!hasZipSignature(apkPath)) {
    writeReport(
        {
            status: 'blocked',
            reason: 'APK path is not a valid APK/ZIP artifact',
            androidHome,
            adb,
            apkPath,
            packageName,
            nextAction: 'Build or copy a valid APK file into artifacts/, then rerun agenthub:native:android.',
        },
        2,
    );
}

const devicesResult = run(adb, ['devices', '-l']);
if (devicesResult.status !== 0) {
    writeReport(
        {
            status: 'blocked',
            reason: 'adb devices failed',
            androidHome,
            adb,
            apkPath,
            packageName,
            stderr: normalizeStderr(devicesResult.stderr),
            nextAction: 'Fix adb connectivity, confirm `adb devices -l` works, then rerun agenthub:native:android.',
        },
        2,
    );
}

const devices = parseAdbDevices(String(devicesResult.stdout));
const deviceAbis = new Map<string, string>();
for (const candidate of devices.filter((item) => item.state === 'device')) {
    const result = run(adb, ['-s', candidate.id, 'shell', 'getprop', 'ro.product.cpu.abi']);
    if (result.status === 0) {
        deviceAbis.set(candidate.id, String(result.stdout).trim());
    }
}
const device = getPreferredAndroidDevice(devices, requestedDeviceId, deviceAbis);
if (!device) {
    writeReport(
        {
            status: 'blocked',
            reason: requestedDeviceId ? 'requested Android device is not ready' : 'no ready Android device',
            androidHome,
            adb,
            apkPath,
            packageName,
            requestedDeviceId,
            devices: devices.map((candidate) => ({
                ...candidate,
                abi: deviceAbis.get(candidate.id),
            })),
            nextAction: requestedDeviceId
                ? 'Connect or boot the requested Android device, confirm it is listed as `device`, then rerun agenthub:native:android.'
                : 'Connect an arm64 Android device with USB debugging enabled, confirm `adb devices -l` lists it as `device`, then rerun agenthub:native:android.',
        },
        2,
    );
}

const deviceWithAbi = {
    ...device,
    abi: deviceAbis.get(device.id),
};

const plan = buildAndroidNativeQaPlan({
    apkPath,
    packageName,
    deviceId: deviceWithAbi.id,
    outputDir,
    timestamp,
    qaProfile,
});
const steps: Array<Record<string, unknown>> = [];
for (const command of plan.commands) {
    const result = runCommandStep(command);
    steps.push({
        label: command.label,
        executable: command.executable,
        args: command.args,
        outputPath: command.outputPath,
        status: result.status,
        stderr: normalizeStderr(result.stderr),
    });
    const stdout = normalizeStdout(result.stdout);
    const forbiddenOutput = command.forbiddenStdoutIncludes?.find((value) => stdout.includes(value));
    const failureReason = result.status !== 0 && !command.allowFailure
        ? `${command.label} failed`
        : command.expectedStdoutIncludes && !stdout.includes(command.expectedStdoutIncludes)
            ? `${command.label} failed: expected output ${command.expectedStdoutIncludes}`
            : forbiddenOutput
                ? `${command.label} failed: forbidden output ${forbiddenOutput}`
                : undefined;
    if (failureReason) {
        writeReport(
            {
                status: 'failed',
                reason: failureReason,
                androidHome,
                adb,
                apkPath,
                packageName,
                device: deviceWithAbi,
                screenshots: plan.screenshots,
                steps,
            },
            1,
        );
    }
}

writeReport(
    {
        status: 'completed',
        semanticReady: true,
        androidHome,
        adb,
        apkPath,
        packageName,
        device: deviceWithAbi,
        screenshots: plan.screenshots,
        steps,
    },
    0,
);
