import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join, relative } from 'node:path';

type NativeQaEvidenceOptions = {
    artifactsDir: string;
    repoRoot: string;
};

type NativeQaReport = {
    status?: string;
    verificationMode?: string;
    qaProfile?: string;
    semanticReady?: boolean;
    reason?: string;
    nextAction?: string;
    apkPath?: unknown;
    appPath?: unknown;
    packageName?: string;
    bundleIdentifier?: string;
    device?: {
        abi?: string;
        details?: string;
    };
    screenshots?: unknown;
};

type NativeQaScreenshot = {
    name?: string;
    path?: string;
};

type NativeQaReportReadResult =
    | {
          ok: true;
          report: NativeQaReport;
      }
    | {
          ok: false;
          reason: string;
      };

type PlatformEvidence = {
    status: 'missing' | 'completed' | 'blocked' | 'failed';
    reportPath: string;
    reason?: string;
    nextAction?: string;
    deliveryVerified?: boolean;
    automatedVerified?: boolean;
    visualVerified?: boolean;
    visualReportPath?: string;
    visualPackageName?: string;
    appVerified?: boolean;
    packageName?: string;
    bundleIdentifier?: string;
    deviceAbi?: string;
    appPath?: string;
    screenshots?: NativeQaScreenshot[];
};

type NativeQaNextAction = {
    platform: 'android' | 'ios';
    reason: string;
    command: string;
    fallbackCommand: string;
};

type NativeQaCompletionCriterion = {
    id: 'android-arm64-apk' | 'android-arm64-native-qa' | 'ios-native-qa' | 'native-qa-failures';
    label: string;
    passed: boolean;
    evidence: string;
};

export type NativeQaEvidenceAudit = {
    status: 'completed' | 'partial' | 'failed';
    readyToMarkV02Done: boolean;
    repoRoot: string;
    artifactsDir: string;
    handoffPath: string;
    android: PlatformEvidence;
    ios: PlatformEvidence;
    arm64ApkPath: string;
    blockers: string[];
    failures: string[];
    completionCriteria: NativeQaCompletionCriterion[];
    nextActions: NativeQaNextAction[];
};

type NativeQaEvidenceOutput = NativeQaEvidenceAudit & {
    reportPath?: string;
    markdownPath?: string;
};

const REQUIRED_ANDROID_SCREENSHOTS = new Set(['launch', 'modal', 'prompt-keyboard', 'long-content']);
const REQUIRED_IOS_SCREENSHOTS = new Set(['launch', 'modal', 'prompt-keyboard', 'long-content']);

export function auditNativeQaEvidence(options: NativeQaEvidenceOptions): NativeQaEvidenceAudit {
    const failures: string[] = [];
    const blockers: string[] = [];
    const arm64ApkPath = join(options.artifactsDir, 'agenthub-production-arm64-latest.apk');
    const handoffPath = join(options.repoRoot, 'docs', 'agenthub-v02-native-qa-handoff.md');
    const arm64ApkExists = existsSync(arm64ApkPath);
    const arm64ApkIsFile = isFile(arm64ApkPath);
    const arm64ApkVerified = arm64ApkIsFile && hasZipSignature(arm64ApkPath);
    const android = auditAndroidEvidence(options.artifactsDir, arm64ApkPath, failures);
    const ios = auditIosEvidence(options.artifactsDir, options.repoRoot, failures);

    if (!arm64ApkExists) {
        failures.push(`Missing Android arm64 delivery APK: ${arm64ApkPath}`);
    } else if (!arm64ApkIsFile) {
        failures.push(`Android arm64 delivery APK is not a file: ${arm64ApkPath}`);
    } else if (!arm64ApkVerified) {
        failures.push(`Android arm64 delivery APK is not a valid APK/ZIP artifact: ${arm64ApkPath}`);
    }
    if (android.status === 'completed' && !android.deliveryVerified) {
        blockers.push('Android arm64 delivery APK has not been installed on an arm64 device in this evidence set.');
    }
    if (android.status === 'blocked') {
        blockers.push(`Android native QA is blocked: ${android.reason}`);
    } else if (android.status === 'missing') {
        failures.push('Missing Android native QA report.');
    } else if (android.status === 'failed') {
        failures.push(`Android native QA failed: ${android.reason}`);
    }
    if (ios.status === 'blocked') {
        blockers.push(`iOS native QA is blocked: ${ios.reason}`);
    } else if (ios.status === 'missing') {
        failures.push('Missing iOS native QA report.');
    } else if (ios.status === 'failed') {
        failures.push(`iOS native QA failed: ${ios.reason}`);
    }

    const status = failures.length > 0 ? 'failed' : blockers.length > 0 ? 'partial' : 'completed';
    const completionCriteria = buildCompletionCriteria({
        arm64ApkPath,
        arm64ApkVerified,
        android,
        ios,
        failures,
    });

    return {
        status,
        readyToMarkV02Done: status === 'completed' && completionCriteria.every((criterion) => criterion.passed),
        repoRoot: options.repoRoot,
        artifactsDir: options.artifactsDir,
        handoffPath,
        android,
        ios,
        arm64ApkPath,
        blockers,
        failures,
        completionCriteria,
        nextActions: buildNextActions(options.repoRoot, android, ios),
    };
}

export function formatNativeQaEvidenceMarkdown(audit: NativeQaEvidenceOutput) {
    const lines = [
        '# AgentHub V02 Native QA Evidence',
        '',
        `- Status: \`${audit.status}\``,
        `- Ready to mark V02 done: \`${audit.readyToMarkV02Done}\``,
        `- Repository root: \`${audit.repoRoot}\``,
        `- Artifacts dir: \`${audit.artifactsDir}\``,
        ...formatEvidenceOutputPaths(audit),
        `- Native QA handoff: \`${audit.handoffPath}\``,
        `- Android status: \`${audit.android.status}\``,
        `- Android delivery verified: \`${audit.android.deliveryVerified ?? false}\``,
        `- Android automated contract verified: \`${audit.android.automatedVerified ?? false}\``,
        `- Android historical preview visual verified: \`${audit.android.visualVerified ?? false}\``,
        `- Android package: \`${audit.android.packageName ?? 'missing'}\``,
        `- Android ABI: \`${audit.android.deviceAbi ?? 'missing'}\``,
        `- Android report: \`${audit.android.reportPath || 'missing'}\``,
        `- Android preview report: \`${audit.android.visualReportPath || 'missing'}\``,
        `- iOS status: \`${audit.ios.status}\``,
        `- iOS app verified: \`${audit.ios.appVerified ?? false}\``,
        `- iOS app: \`${audit.ios.appPath ?? 'missing'}\``,
        `- iOS bundle: \`${audit.ios.bundleIdentifier ?? 'missing'}\``,
        `- iOS report: \`${audit.ios.reportPath || 'missing'}\``,
        `- Android arm64 APK: \`${audit.arm64ApkPath}\``,
        '',
        '## Evidence Details',
        ...formatScreenshots('Android', audit.android.screenshots),
        ...formatScreenshots('iOS', audit.ios.screenshots),
        '',
        '## Completion Criteria',
        ...formatCompletionCriteria(audit.completionCriteria),
        '',
        '## Blockers',
        ...formatList(audit.blockers),
        '',
        '## Failures',
        ...formatList(audit.failures),
        '',
        '## Next Actions',
        ...formatNextActions(audit.nextActions),
        '',
    ];

    return `${lines.join('\n')}\n`;
}

function formatEvidenceOutputPaths(audit: NativeQaEvidenceOutput) {
    const lines: string[] = [];
    if (audit.reportPath) {
        lines.push(`- Evidence JSON: \`${audit.reportPath}\``);
    }
    if (audit.markdownPath) {
        lines.push(`- Evidence Markdown: \`${audit.markdownPath}\``);
    }
    return lines;
}

function auditAndroidEvidence(artifactsDir: string, arm64ApkPath: string, failures: string[]): PlatformEvidence {
    const reportPath = findLatestReport(artifactsDir, /^agenthub-v02-android-native-qa-\d{8}-\d{4}\.json$/);
    if (!reportPath) {
        return { status: 'missing', reportPath: '' };
    }

    const readResult = tryReadReport(reportPath);
    if (!readResult.ok) {
        return {
            status: 'failed',
            reportPath,
            reason: readResult.reason,
        };
    }
    const report = readResult.report;
    if (report.status !== 'completed') {
        return {
            status: report.status === 'blocked' ? 'blocked' : 'failed',
            reportPath,
            reason: report.reason ?? report.status,
            nextAction: report.nextAction,
            packageName: report.packageName,
            deviceAbi: getAndroidDeviceAbi(report),
            screenshots: getScreenshotArray(report, artifactsDir),
        };
    }
    if (report.packageName !== 'com.artsum.agenthub') {
        failures.push(`Unexpected Android package name in QA report: ${report.packageName ?? 'missing'}`);
    }
    if (typeof report.apkPath !== 'string') {
        failures.push('Android QA report apkPath must be a string.');
    } else if (!isAbsolute(report.apkPath)) {
        failures.push('Android QA report apkPath must be an absolute path.');
    } else if (!isPathInsideDirectory(report.apkPath, artifactsDir)) {
        failures.push(`Android QA report APK artifact is outside artifacts dir: ${report.apkPath}`);
    } else if (!existsSync(report.apkPath)) {
        failures.push(`Missing Android QA report APK artifact: ${report.apkPath}`);
    } else if (!isFile(report.apkPath)) {
        failures.push(`Android QA report APK artifact is not a file: ${report.apkPath}`);
    } else if (!hasZipSignature(report.apkPath)) {
        failures.push(`Android QA report APK artifact is not a valid APK/ZIP artifact: ${report.apkPath}`);
    }
    const automatedVerified = report.verificationMode === 'automated-contract';
    const requiredScreenshots = report.qaProfile === 'production-smoke'
        ? new Set(['launch'])
        : REQUIRED_ANDROID_SCREENSHOTS;
    const screenshots = automatedVerified
        ? []
        : auditScreenshots('Android', report, requiredScreenshots, failures, artifactsDir);
    const preview = automatedVerified
        ? { verified: false, reportPath: '', packageName: undefined }
        : auditAndroidPreviewEvidence(artifactsDir, failures);

    return {
        status: 'completed',
        reportPath,
        deliveryVerified: isAndroidArm64DeliveryReport(report, arm64ApkPath),
        automatedVerified,
        packageName: report.packageName,
        deviceAbi: getAndroidDeviceAbi(report),
        screenshots,
        visualVerified: preview.verified,
        visualReportPath: preview.reportPath,
        visualPackageName: preview.packageName,
    };
}

function auditAndroidPreviewEvidence(artifactsDir: string, failures: string[]) {
    const reportPath = findLatestReport(artifactsDir, /^agenthub-v02-android-preview-native-qa-\d{8}-\d{4}\.json$/);
    if (!reportPath) {
        return { verified: false, reportPath: '' };
    }

    const readResult = tryReadReport(reportPath);
    if (!readResult.ok) {
        failures.push(`Android preview visual QA report is invalid: ${readResult.reason}`);
        return { verified: false, reportPath };
    }
    const report = readResult.report;
    if (report.status !== 'completed') {
        failures.push(`Android preview visual QA failed: ${report.reason ?? report.status}`);
        return { verified: false, reportPath, packageName: report.packageName };
    }
    const failureCount = failures.length;
    if (report.qaProfile !== 'preview-visual') {
        failures.push(`Unexpected Android preview QA profile: ${report.qaProfile ?? 'missing'}`);
    }
    if (report.packageName !== 'com.artsum.agenthub.preview') {
        failures.push(`Unexpected Android preview package name: ${report.packageName ?? 'missing'}`);
    }
    if (typeof report.apkPath !== 'string') {
        failures.push('Android preview QA report apkPath must be a string.');
    } else if (!isAbsolute(report.apkPath) || !isPathInsideDirectory(report.apkPath, artifactsDir)) {
        failures.push(`Android preview QA report APK artifact is outside artifacts dir: ${report.apkPath}`);
    } else if (!isFile(report.apkPath) || !hasZipSignature(report.apkPath)) {
        failures.push(`Android preview QA report APK artifact is missing or invalid: ${report.apkPath}`);
    }
    auditScreenshots('Android preview', report, REQUIRED_ANDROID_SCREENSHOTS, failures, artifactsDir);
    const hasValidIdentity = report.qaProfile === 'preview-visual'
        && report.packageName === 'com.artsum.agenthub.preview';
    const hasValidApk = typeof report.apkPath === 'string'
        && isAbsolute(report.apkPath)
        && isPathInsideDirectory(report.apkPath, artifactsDir)
        && isFile(report.apkPath)
        && hasZipSignature(report.apkPath);
    return {
        verified: hasValidIdentity && hasValidApk && failures.length === failureCount,
        reportPath,
        packageName: report.packageName,
    };
}

function auditIosEvidence(artifactsDir: string, repoRoot: string, failures: string[]): PlatformEvidence {
    const reportPath = findLatestReport(artifactsDir, /^agenthub-v02-ios-native-qa-\d{8}-\d{4}\.json$/);
    if (!reportPath) {
        return { status: 'missing', reportPath: '' };
    }

    const readResult = tryReadReport(reportPath);
    if (!readResult.ok) {
        return {
            status: 'failed',
            reportPath,
            reason: readResult.reason,
        };
    }
    const report = readResult.report;
    if (report.status === 'completed') {
        const expectedAppPath = join(repoRoot, 'artifacts', 'AgentHubPreview.app');
        const appPath = typeof report.appPath === 'string' ? report.appPath : undefined;
        const appPathMatches = appPath === expectedAppPath;
        const appArtifactExists = appPathMatches && existsSync(expectedAppPath);
        const appArtifactIsDirectory = appPathMatches && isDirectory(expectedAppPath);
        const appVerified = appPathMatches && appArtifactIsDirectory;
        if (typeof report.appPath !== 'string') {
            failures.push('iOS QA report appPath must be a string.');
        } else if (!isAbsolute(report.appPath)) {
            failures.push('iOS QA report appPath must be an absolute path.');
        } else if (!appPathMatches) {
            failures.push(`Unexpected iOS app path in QA report: ${appPath}`);
        } else if (!appArtifactExists) {
            failures.push(`Missing iOS app artifact: ${expectedAppPath}`);
        } else if (!appArtifactIsDirectory) {
            failures.push(`iOS app artifact is not a directory: ${expectedAppPath}`);
        }
        if (report.bundleIdentifier !== 'com.artsum.agenthub') {
            failures.push(`Unexpected iOS bundle identifier in QA report: ${report.bundleIdentifier ?? 'missing'}`);
        }
        const automatedVerified = report.verificationMode === 'automated-contract';
        const screenshots = automatedVerified
            ? []
            : auditScreenshots('iOS', report, REQUIRED_IOS_SCREENSHOTS, failures, artifactsDir);
        return {
            status: 'completed',
            reportPath,
            appVerified,
            automatedVerified,
            appPath,
            bundleIdentifier: report.bundleIdentifier,
            screenshots,
        };
    }
    if (report.status === 'blocked') {
        return {
            status: 'blocked',
            reportPath,
            reason: report.reason ?? 'unknown',
            nextAction: report.nextAction,
            appPath: typeof report.appPath === 'string' ? report.appPath : undefined,
            bundleIdentifier: report.bundleIdentifier,
            screenshots: getScreenshotArray(report, artifactsDir),
        };
    }
    return {
        status: 'failed',
        reportPath,
        reason: report.reason ?? report.status ?? 'unknown',
        nextAction: report.nextAction,
        appPath: typeof report.appPath === 'string' ? report.appPath : undefined,
        bundleIdentifier: report.bundleIdentifier,
        screenshots: getScreenshotArray(report, artifactsDir),
    };
}

function findLatestReport(artifactsDir: string, pattern: RegExp) {
    if (!existsSync(artifactsDir)) {
        return undefined;
    }
    const file = readdirSync(artifactsDir)
        .filter((entry) => pattern.test(entry))
        .sort()
        .at(-1);
    return file ? join(artifactsDir, file) : undefined;
}

function tryReadReport(path: string): NativeQaReportReadResult {
    try {
        const report = JSON.parse(readFileSync(path, 'utf8')) as unknown;
        if (!report || typeof report !== 'object' || Array.isArray(report)) {
            return {
                ok: false,
                reason: 'report JSON was not an object',
            };
        }
        if (typeof (report as NativeQaReport).status !== 'string') {
            return {
                ok: false,
                reason: 'report status was missing or invalid',
            };
        }
        return {
            ok: true,
            report: report as NativeQaReport,
        };
    } catch {
        return {
            ok: false,
            reason: 'report JSON was not parseable',
        };
    }
}

function auditScreenshots(
    platform: 'Android' | 'Android preview' | 'iOS',
    report: NativeQaReport,
    requiredScreenshots: Set<string>,
    failures: string[],
    artifactsDir: string,
) {
    if (!Array.isArray(report.screenshots)) {
        failures.push(`${platform} QA report screenshots must be an array.`);
        for (const required of requiredScreenshots) {
            failures.push(`${platform} QA report is missing screenshot entry: ${required}`);
        }
        return undefined;
    }

    const seenScreenshots = new Set<string>();
    const seenScreenshotPaths = new Set<string>();
    const screenshots: NativeQaScreenshot[] = [];
    for (const screenshot of report.screenshots) {
        if (!screenshot || typeof screenshot !== 'object' || Array.isArray(screenshot)) {
            failures.push(`${platform} QA screenshot entry must be an object.`);
            continue;
        }

        const rawName = (screenshot as NativeQaScreenshot).name;
        const rawPath = (screenshot as NativeQaScreenshot).path;
        const normalized: NativeQaScreenshot = {};
        if (rawName === undefined) {
            failures.push(`${platform} QA screenshot entry has invalid name: missing`);
        } else if (typeof rawName !== 'string') {
            failures.push(`${platform} QA screenshot entry has invalid name: ${String(rawName)}`);
        } else {
            normalized.name = rawName;
            if (seenScreenshots.has(rawName)) {
                failures.push(`${platform} QA screenshot name is reused: ${rawName}`);
            }
            seenScreenshots.add(rawName);
        }

        if (rawPath === undefined) {
            failures.push(`${platform} QA screenshot ${normalized.name ?? 'entry'} has invalid path: missing`);
        } else if (typeof rawPath !== 'string') {
            failures.push(`${platform} QA screenshot ${normalized.name ?? 'entry'} has invalid path: ${String(rawPath)}`);
        } else {
            normalized.path = rawPath;
            if (seenScreenshotPaths.has(rawPath)) {
                failures.push(`${platform} QA screenshot path is reused: ${rawPath}`);
            }
            seenScreenshotPaths.add(rawPath);
            if (!rawPath.endsWith('.png')) {
                failures.push(`${platform} screenshot is not a PNG artifact: ${rawPath}`);
            }
            if (!isPathInsideDirectory(rawPath, artifactsDir)) {
                failures.push(`${platform} QA screenshot ${normalized.name ?? 'entry'} is outside artifacts dir: ${rawPath}`);
            }
            if (!existsSync(rawPath)) {
                failures.push(`Missing ${platform} screenshot: ${rawPath}`);
            } else if (!isFile(rawPath)) {
                failures.push(`${platform} screenshot is not a file: ${rawPath}`);
            } else if (isEmptyFile(rawPath)) {
                failures.push(`${platform} screenshot is empty: ${rawPath}`);
            } else if (!hasPngSignature(rawPath)) {
                failures.push(`${platform} screenshot is not a valid PNG artifact: ${rawPath}`);
            }
        }
        screenshots.push(normalized);
    }
    for (const required of requiredScreenshots) {
        if (!seenScreenshots.has(required)) {
            failures.push(`${platform} QA report is missing screenshot entry: ${required}`);
        }
    }
    return screenshots;
}

function isPathInsideDirectory(path: string, directory: string) {
    if (!isAbsolute(path)) {
        return false;
    }
    const relativePath = relative(directory, path);
    return relativePath !== '' && !relativePath.startsWith('..') && !isAbsolute(relativePath);
}

function isDirectory(path: string) {
    try {
        return statSync(path).isDirectory();
    } catch {
        return false;
    }
}

function isFile(path: string) {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
}

function isEmptyFile(path: string) {
    try {
        return statSync(path).size === 0;
    } catch {
        return false;
    }
}

function hasPngSignature(path: string) {
    try {
        const signature = readFileSync(path).subarray(0, 8);
        return signature.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
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

function getScreenshotArray(report: NativeQaReport, artifactsDir: string): NativeQaScreenshot[] | undefined {
    if (!Array.isArray(report.screenshots)) {
        return undefined;
    }
    return report.screenshots
        .filter((screenshot) => screenshot && typeof screenshot === 'object' && !Array.isArray(screenshot))
        .map((screenshot) => {
            const name = (screenshot as NativeQaScreenshot).name;
            const path = (screenshot as NativeQaScreenshot).path;
            return {
                name: typeof name === 'string' ? name : undefined,
                path: typeof path === 'string' && isPathInsideDirectory(path, artifactsDir) ? path : undefined,
            };
        });
}

function isAndroidArm64DeliveryReport(report: NativeQaReport, arm64ApkPath: string) {
    if (report.qaProfile !== 'production-smoke' || report.semanticReady !== true) {
        return false;
    }
    if (typeof report.apkPath !== 'string') {
        return false;
    }
    if (report.apkPath !== arm64ApkPath) {
        return false;
    }
    const abi = getAndroidDeviceAbi(report) ?? '';
    return abi.includes('arm64-v8a');
}

function getAndroidDeviceAbi(report: NativeQaReport) {
    return report.device?.abi ?? report.device?.details;
}

function buildNextActions(repoRoot: string, android: PlatformEvidence, ios: PlatformEvidence): NativeQaNextAction[] {
    const actions: NativeQaNextAction[] = [];
    const androidCommand = 'PATH="$ANDROID_HOME/platform-tools:$PATH" npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:android';
    const androidFallbackCommand = 'PATH="$ANDROID_HOME/platform-tools:$PATH" node scripts/agenthub-android-native-qa.mjs';

    if (android.status === 'completed' && !android.deliveryVerified) {
        actions.push({
            platform: 'android',
            reason: 'Install and capture the arm64 delivery APK on an arm64 Android device.',
            command: androidCommand,
            fallbackCommand: androidFallbackCommand,
        });
    } else if (android.status === 'blocked') {
        actions.push({
            platform: 'android',
            reason: android.nextAction ?? 'Resolve the Android native QA blocker, then rerun agenthub:native:android.',
            command: androidCommand,
            fallbackCommand: androidFallbackCommand,
        });
    } else if (android.status === 'missing') {
        actions.push({
            platform: 'android',
            reason: 'Run Android native QA on an arm64 device with the delivery APK.',
            command: androidCommand,
            fallbackCommand: androidFallbackCommand,
        });
    } else if (android.status === 'failed') {
        actions.push({
            platform: 'android',
            reason: `Resolve Android native QA failure: ${android.reason ?? 'unknown'}. Then rerun on an arm64 device.`,
            command: androidCommand,
            fallbackCommand: androidFallbackCommand,
        });
    }

    if (ios.status === 'blocked' || ios.status === 'missing' || ios.status === 'failed') {
        const iosAppPath = join(repoRoot, 'artifacts', 'AgentHubPreview.app');
        const reason =
            ios.status === 'failed'
                ? `Resolve iOS native QA failure: ${ios.reason ?? 'unknown'}. Then rerun from macOS with Xcode simctl.`
                : (ios.nextAction ?? 'Run iOS native QA from macOS with Xcode simctl and an AgentHubPreview.app artifact.');
        actions.push({
            platform: 'ios',
            reason,
            command: `AGENTHUB_IOS_APP="${iosAppPath}" npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:ios`,
            fallbackCommand: `AGENTHUB_IOS_APP="${iosAppPath}" node scripts/agenthub-ios-native-qa.mjs`,
        });
    }

    return actions;
}

function buildCompletionCriteria(options: {
    arm64ApkPath: string;
    arm64ApkVerified: boolean;
    android: PlatformEvidence;
    ios: PlatformEvidence;
    failures: string[];
}): NativeQaCompletionCriterion[] {
    return [
        {
            id: 'android-arm64-apk',
            label: 'Android arm64 delivery APK exists',
            passed: options.arm64ApkVerified,
            evidence: options.arm64ApkPath,
        },
        {
            id: 'android-arm64-native-qa',
            label: 'Android arm64 device native QA completed',
            passed: options.android.status === 'completed'
                && options.android.deliveryVerified === true
                && (options.android.automatedVerified === true || options.android.visualVerified === true),
            evidence: options.android.reportPath || 'missing',
        },
        {
            id: 'ios-native-qa',
            label: 'iOS native QA completed',
            passed: options.ios.status === 'completed' && options.ios.appVerified === true,
            evidence: options.ios.reportPath || 'missing',
        },
        {
            id: 'native-qa-failures',
            label: 'Native QA audit has no failures',
            passed: options.failures.length === 0,
            evidence: `failures: ${options.failures.length}`,
        },
    ];
}

function formatList(items: string[]) {
    return items.length > 0 ? items.map((item) => `- ${item}`) : ['- None'];
}

function formatCompletionCriteria(criteria: NativeQaCompletionCriterion[]) {
    return criteria.map((criterion) => {
        const checkbox = criterion.passed ? 'x' : ' ';
        return `- [${checkbox}] ${criterion.label} - \`${criterion.evidence}\``;
    });
}

function formatNextActions(actions: NativeQaNextAction[]) {
    if (actions.length === 0) {
        return ['- None'];
    }

    return actions.flatMap((action) => [
        `- ${action.platform}: ${action.reason}`,
        `  - Command: \`${action.command}\``,
        `  - Fallback: \`${action.fallbackCommand}\``,
    ]);
}

function formatScreenshots(platform: 'Android' | 'iOS', screenshots: PlatformEvidence['screenshots']) {
    if (!screenshots || screenshots.length === 0) {
        return [`- ${platform} screenshots: none`];
    }

    return screenshots.map((screenshot) => `- ${platform} screenshot ${screenshot.name ?? 'unnamed'}: \`${screenshot.path ?? 'missing'}\``);
}
