import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';
import { parseBuffer as parseBinaryPlist } from 'bplist-parser';
import {
    buildIosNativeQaPlan,
    parseXcrunSimctlBootedDevices,
    type IosQaCommand,
} from './iosNativeQaPlan';
import { readIosSecurityQaEvidence } from './iosSecurityQaEvidence';

const repoRoot = process.cwd();
const outputDir = process.env.AGENTHUB_IOS_QA_ARTIFACTS_DIR || join(repoRoot, 'artifacts');
const bundleIdentifier = process.env.AGENTHUB_IOS_BUNDLE_ID || 'com.artsum.agenthub';
const appPath =
    process.env.AGENTHUB_IOS_APP ||
    join(outputDir, 'AgentHubPreview.app');
const requestedDeviceId = process.env.AGENTHUB_IOS_DEVICE;
const securityEvidencePath =
    process.env.AGENTHUB_IOS_SECURITY_EVIDENCE ||
    join(outputDir, 'agenthub-ios-security-qa-latest.json');
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

function runCommandStep(step: IosQaCommand) {
    if (step.executable === 'sleep') {
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Number(step.args[0]) * 1000);
        return { status: 0, stdout: '', stderr: '' };
    }

    const result = run('xcrun', step.args, { encoding: step.outputPath ? 'buffer' : 'utf8' });
    if (step.outputPath && result.status === 0 && Buffer.isBuffer(result.stdout) && result.stdout.length > 0) {
        writeFileSync(step.outputPath, result.stdout);
    }
    return result;
}

function normalizeStderr(stderr: string | Buffer) {
    return Buffer.isBuffer(stderr) ? stderr.toString('utf8').trim() : stderr.trim();
}

function isDirectory(path: string) {
    try {
        return statSync(path).isDirectory();
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

function readXmlBundleIdentifier(path: string) {
    try {
        const infoPlistBuffer = readFileSync(join(path, 'Info.plist'));
        if (infoPlistBuffer.subarray(0, 8).equals(Buffer.from('bplist00'))) {
            const [plist] = parseBinaryPlist(infoPlistBuffer) as Array<{ CFBundleIdentifier?: unknown }>;
            return typeof plist?.CFBundleIdentifier === 'string' ? plist.CFBundleIdentifier : undefined;
        }
        const infoPlist = infoPlistBuffer.toString('utf8');
        const bundleIdMatch = infoPlist.match(
            /<key>\s*CFBundleIdentifier\s*<\/key>\s*<string>\s*([^<]+?)\s*<\/string>/,
        );
        return bundleIdMatch?.[1];
    } catch {
        return undefined;
    }
}

function writeReport(report: Record<string, unknown>, status: number): never {
    mkdirSync(outputDir, { recursive: true });
    const reportPath = join(outputDir, `agenthub-v02-ios-native-qa-${timestamp}.json`);
    const automatedReport = { verificationMode: 'automated-contract', ...report };
    writeFileSync(reportPath, `${JSON.stringify(automatedReport, null, 2)}\n`);
    console.log(JSON.stringify({ ...automatedReport, reportPath }, null, 2));
    process.exit(status);
}

const xcrunResult = run('xcrun', ['--find', 'simctl']);
if (xcrunResult.status !== 0) {
    writeReport(
        {
            status: 'blocked',
            reason: 'xcrun simctl not found',
            appPath,
            bundleIdentifier,
            stderr: normalizeStderr(xcrunResult.stderr),
            nextAction: 'Run this on macOS with Xcode command line tools, then rerun agenthub:native:ios.',
        },
        2,
    );
}

if (!existsSync(appPath)) {
    writeReport(
        {
            status: 'blocked',
            reason: 'iOS .app not found',
            appPath,
            bundleIdentifier,
            nextAction: 'Build or copy AgentHubPreview.app into artifacts/, set AGENTHUB_IOS_APP if needed, then rerun agenthub:native:ios.',
        },
        2,
    );
}

if (!isDirectory(appPath)) {
    writeReport(
        {
            status: 'blocked',
            reason: 'iOS .app path is not a directory',
            appPath,
            bundleIdentifier,
            nextAction: 'Build or copy an AgentHubPreview.app directory into artifacts/, set AGENTHUB_IOS_APP if needed, then rerun agenthub:native:ios.',
        },
        2,
    );
}

if (!isPathInsideDirectory(appPath, outputDir)) {
    writeReport(
        {
            status: 'blocked',
            reason: 'iOS .app path is outside artifacts',
            appPath,
            bundleIdentifier,
            nextAction: 'Build or copy AgentHubPreview.app into the active artifacts/ directory, set AGENTHUB_IOS_APP if needed, then rerun agenthub:native:ios.',
        },
        2,
    );
}

const appBundleIdentifier = readXmlBundleIdentifier(appPath);
if (appBundleIdentifier !== bundleIdentifier) {
    writeReport(
        {
            status: 'blocked',
            reason: 'iOS .app bundle identifier mismatch',
            appPath,
            bundleIdentifier,
            appBundleIdentifier: appBundleIdentifier ?? 'missing',
            nextAction: `Build or copy AgentHubPreview.app with bundle id ${bundleIdentifier} into artifacts/, then rerun agenthub:native:ios.`,
        },
        2,
    );
}

const devicesResult = run('xcrun', ['simctl', 'list', 'devices', 'booted', '--json']);
if (devicesResult.status !== 0) {
    writeReport(
        {
            status: 'blocked',
            reason: 'simctl booted devices query failed',
            appPath,
            bundleIdentifier,
            stderr: normalizeStderr(devicesResult.stderr),
            nextAction: 'Boot an iOS simulator and confirm `xcrun simctl list devices booted --json` works, then rerun agenthub:native:ios.',
        },
        2,
    );
}

let devices;
try {
    devices = parseXcrunSimctlBootedDevices(String(devicesResult.stdout));
} catch (error) {
    writeReport(
        {
            status: 'blocked',
            reason: 'simctl booted devices json was not parseable',
            appPath,
            bundleIdentifier,
            error: error instanceof Error ? error.message : String(error),
            nextAction: 'Fix the Xcode simctl environment so booted devices JSON is parseable, then rerun agenthub:native:ios.',
        },
        2,
    );
}
const device = requestedDeviceId
    ? devices.find((candidate) => candidate.udid === requestedDeviceId)
    : devices[0];
if (!device) {
    writeReport(
        {
            status: 'blocked',
            reason: requestedDeviceId ? 'requested iOS simulator is not booted' : 'no booted iOS simulator',
            appPath,
            bundleIdentifier,
            requestedDeviceId,
            devices,
            nextAction: requestedDeviceId
                ? 'Boot the requested iOS simulator, confirm it appears in `xcrun simctl list devices booted --json`, then rerun agenthub:native:ios.'
                : 'Boot an iOS simulator, confirm it appears in `xcrun simctl list devices booted --json`, then rerun agenthub:native:ios.',
        },
        2,
    );
}

const plan = buildIosNativeQaPlan({
    appPath,
    bundleIdentifier,
    deviceId: device.udid,
    outputDir,
    timestamp,
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
    if (result.status !== 0 && !command.allowFailure) {
        writeReport(
            {
                status: 'failed',
                reason: `${command.label} failed`,
                appPath,
                bundleIdentifier,
                device,
                screenshots: plan.screenshots,
                steps,
            },
            1,
        );
    }
}

const securityEvidence = readIosSecurityQaEvidence({
    evidencePath: securityEvidencePath,
    artifactsDir: outputDir,
    expectedDeviceId: device.udid,
});
if (securityEvidence.status !== 'completed') {
    writeReport(
        {
            status: securityEvidence.status,
            reason: securityEvidence.reason,
            automationStatus: 'completed',
            appPath,
            bundleIdentifier,
            device,
            screenshots: plan.screenshots,
            steps,
            securityCases: plan.securityCases,
            securityEvidencePath,
            nextAction: securityEvidence.status === 'blocked'
                ? 'Run the iOS security XCTest/automation matrix, write agenthub-ios-security-qa-latest.json under artifacts/, then rerun agenthub:native:ios.'
                : 'Repair the invalid iOS security QA evidence and its per-case artifacts, then rerun agenthub:native:ios.',
        },
        securityEvidence.status === 'blocked' ? 2 : 1,
    );
}

writeReport(
    {
        status: 'completed',
        automationStatus: 'completed',
        appPath,
        bundleIdentifier,
        device,
        screenshots: plan.screenshots,
        steps,
        securityCases: plan.securityCases,
        securityEvidencePath,
        securityEvidence: securityEvidence.evidence,
    },
    0,
);
