import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(__dirname, '..', '..', '..', '..');
const handoffPath = join(repoRoot, 'docs', 'agenthub-v02-native-qa-handoff.md');

function readHandoff() {
    return readFileSync(handoffPath, 'utf8');
}

describe('AgentHub V02 native QA handoff document', () => {
    it('exists as the external-device handoff for V02 evidence completion', () => {
        expect(existsSync(handoffPath)).toBe(true);
    });

    it('documents the exact Android arm64 and iOS evidence commands and completion gate', () => {
        const handoff = readHandoff();

        expect(handoff).toContain('# AgentHub V02 Native QA Handoff');
        expect(handoff).toContain('Run every command from the repository root');
        expect(handoff).toContain('agenthub-production-arm64-latest.apk');
        expect(handoff).toContain('Set `ANDROID_HOME` to the local Android SDK root');
        expect(handoff).toContain('`reason: ANDROID_HOME not set`');
        expect(handoff).toContain('If the APK path exists but is not a file, the runner writes `reason: APK path is not a file`');
        expect(handoff).toContain('If the APK path points outside the active `artifacts/` directory, the runner writes `reason: APK path is outside artifacts`');
        expect(handoff).toContain('If the APK path is not a valid APK/ZIP artifact, the runner writes `reason: APK path is not a valid APK/ZIP artifact`');
        expect(handoff).toContain('PATH="$ANDROID_HOME/platform-tools:$PATH" npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:android');
        expect(handoff).toContain('PATH="$ANDROID_HOME/platform-tools:$PATH" node scripts/agenthub-android-native-qa.mjs');
        expect(handoff).toContain('`apkPath` must be a string');
        expect(handoff).toContain('`apkPath` must be an absolute path');
        expect(handoff).toContain('`apkPath` must stay inside the repository `artifacts/` directory');
        expect(handoff).toContain('`apkPath` must point to an existing APK artifact');
        expect(handoff).toContain('`apkPath` must point to a file, not a directory');
        expect(handoff).toContain('`apkPath` must point to a valid APK/ZIP artifact');
        expect(handoff).toContain('the delivery APK artifact must be a file, not a directory');
        expect(handoff).toContain('the delivery APK artifact must have a valid APK/ZIP file signature');
        expect(handoff).toContain('`verificationMode` is `automated-contract`');
        expect(handoff).toContain('No screenshot, recording, or manual visual approval is required');
        expect(handoff).toContain('foreground Activity, UIAutomator semantics, ABI, and logcat');
        expect(handoff).toContain('If `xcrun simctl` is missing, the runner writes a blocked report with `reason: xcrun simctl not found`');
        expect(handoff).toContain('If the `.app` path exists but is not a directory, the runner writes `reason: iOS .app path is not a directory`');
        expect(handoff).toContain('If the `.app` path points outside the active `artifacts/` directory, the runner writes `reason: iOS .app path is outside artifacts`');
        expect(handoff).toContain('If XML or binary `Info.plist` does not declare `CFBundleIdentifier` as `com.artsum.agenthub`, the runner writes `reason: iOS .app bundle identifier mismatch`');
        expect(handoff).toContain('AGENTHUB_IOS_APP="$PWD/artifacts/AgentHubPreview.app" npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:ios');
        expect(handoff).toContain('AGENTHUB_IOS_APP="$PWD/artifacts/AgentHubPreview.app" node scripts/agenthub-ios-native-qa.mjs');
        expect(handoff).toContain('`appPath` must be a string');
        expect(handoff).toContain('`appPath` must be an absolute path');
        expect(handoff).toContain('`appPath` must point to an existing AgentHubPreview.app artifact');
        expect(handoff).toContain('`appPath` must point to an AgentHubPreview.app directory, not a file');
        expect(handoff).toContain('XML or binary `Info.plist` must declare `CFBundleIdentifier` as `com.artsum.agenthub`');
        expect(handoff).toContain('npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:evidence');
        expect(handoff).toContain('Do not use `agenthub:native:evidence:allow-partial` as completion proof');
        expect(handoff).toContain('Do not mark V02 done while the strict gate exits 2');
        expect(handoff).toContain('Before marking V02 done');
        expect(handoff).toContain('inspect `artifacts/agenthub-v02-native-qa-evidence-latest.md`');
        expect(handoff).toContain('all four checklist rows are checked');
        expect(handoff).toContain('then update `design/Design.md`, `docs/project-status.md`, and `docs/validation-coverage.md` to record V02 native QA as complete');
        expect(handoff).toContain('`readyToMarkV02Done: true`');
        expect(handoff).toContain('`completionCriteria`');
        expect(handoff).toContain('`android-arm64-native-qa`');
        expect(handoff).toContain('`ios-native-qa`');
        expect(handoff).toContain('`native-qa-failures`');
        expect(handoff).toContain('uses malformed field shapes');
        expect(handoff).toContain('points `apkPath` outside `artifacts/`');
        expect(handoff).toContain('fails closed with explicit artifact and schema errors');
        expect(handoff).toContain('Historical reports that predate `automated-contract`');
    });
});
