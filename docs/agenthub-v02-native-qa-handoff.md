# AgentHub V02 Native QA Handoff

This handoff is the external-device checklist for finishing AgentHub 1.0 V02 native QA evidence. It is only needed after the Web authenticated checks, Android arm64 APK build, Android x86_64 AVD smoke, and current partial evidence audit already exist.

Run every command from the repository root. The commands below rely on repository-relative `artifacts/` paths and package scripts.

## Current State

- Android arm64 delivery APK: `artifacts/agenthub-production-arm64-latest.apk`
- Evidence report: `artifacts/agenthub-v02-native-qa-evidence-latest.json`
- Evidence summary: `artifacts/agenthub-v02-native-qa-evidence-latest.md`
- Current expected partial blockers: Android arm64 device native QA and iOS native QA.

Do not mark V02 done from this state. The completion gate is `readyToMarkV02Done: true` from the strict evidence command below. Do not mark V02 done while the strict gate exits 2.

## Android Arm64 Device

Use a real Android arm64 device with USB debugging enabled. The latest delivery APK must be installed and verified by automated foreground Activity, UIAutomator semantics, ABI, and logcat assertions. No screenshot, recording, or manual visual approval is required. Set `ANDROID_HOME` to the local Android SDK root before running the command. If `ANDROID_HOME` is missing, the runner writes `reason: ANDROID_HOME not set`. If the APK path exists but is not a file, the runner writes `reason: APK path is not a file`. If the APK path points outside the active `artifacts/` directory, the runner writes `reason: APK path is outside artifacts`. If the APK path is not a valid APK/ZIP artifact, the runner writes `reason: APK path is not a valid APK/ZIP artifact`. Android blocked reports include `nextAction` for SDK setup, missing `adb`, missing APK, invalid APK path, adb connectivity, and no-ready-device states; follow that next action before retrying.

```bash
PATH="$ANDROID_HOME/platform-tools:$PATH" npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:android
```

If the package-manager wrapper hangs in the external device environment, run the root-script fallback from the repository root:

```bash
PATH="$ANDROID_HOME/platform-tools:$PATH" node scripts/agenthub-android-native-qa.mjs
```

The generated Android report must prove:

- `packageName` is `com.artsum.agenthub`.
- `apkPath` is `artifacts/agenthub-production-arm64-latest.apk`.
- `apkPath` must be a string.
- `apkPath` must be an absolute path.
- `apkPath` must stay inside the repository `artifacts/` directory.
- `apkPath` must point to an existing APK artifact.
- `apkPath` must point to a file, not a directory.
- `apkPath` must point to a valid APK/ZIP artifact.
- the delivery APK artifact must be a file, not a directory.
- the delivery APK artifact must have a valid APK/ZIP file signature.
- device ABI includes `arm64-v8a`.
- `verificationMode` is `automated-contract`.
- production foreground Activity and `AgentHub` UI semantics pass.
- logcat contains no package ANR or `FATAL EXCEPTION`.

## iOS Simulator Or Device

Run this from macOS with Xcode command line tools. `xcrun simctl` must be available, and `AGENTHUB_IOS_APP` must point to an AgentHub preview `.app` artifact with bundle id `com.artsum.agenthub`. If `xcrun simctl` is missing, the runner writes a blocked report with `reason: xcrun simctl not found`. If the `.app` path exists but is not a directory, the runner writes `reason: iOS .app path is not a directory`. If the `.app` path points outside the active `artifacts/` directory, the runner writes `reason: iOS .app path is outside artifacts`. If XML or binary `Info.plist` does not declare `CFBundleIdentifier` as `com.artsum.agenthub`, the runner writes `reason: iOS .app bundle identifier mismatch`. iOS blocked reports include `nextAction` for missing `xcrun simctl`, missing `.app`, invalid `.app` path, bundle id mismatch, simctl query failures, unparsable device JSON, and no booted simulator states; follow that next action before retrying.

```bash
AGENTHUB_IOS_APP="$PWD/artifacts/AgentHubPreview.app" npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:ios
```

If the package-manager wrapper hangs in the macOS device environment, run the root-script fallback from the repository root:

```bash
AGENTHUB_IOS_APP="$PWD/artifacts/AgentHubPreview.app" node scripts/agenthub-ios-native-qa.mjs
```

The generated iOS report must prove:

- `appPath` is `artifacts/AgentHubPreview.app` from the repository root.
- `appPath` must be a string.
- `appPath` must be an absolute path.
- `appPath` must point to an existing AgentHubPreview.app artifact.
- `appPath` must point to an AgentHubPreview.app directory, not a file.
- XML or binary `Info.plist` must declare `CFBundleIdentifier` as `com.artsum.agenthub`.
- `bundleIdentifier` is `com.artsum.agenthub`.
- `verificationMode` is `automated-contract` and `automationStatus` is `completed`.
- install, launch and system-log commands complete without a blocking failure.
- the independent security matrix evidence exists at `artifacts/agenthub-ios-security-qa-latest.json` (or the in-artifacts path supplied by `AGENTHUB_IOS_SECURITY_EVIDENCE`).
- the security evidence belongs to the same booted simulator UDID used by the automation runner.
- all eight required cases are unique and have `status: passed`: `account-isolation`, `delayed-response-abort`, `offline-mermaid`, `recovery-key-auth-cancel`, `recovery-key-auth-success`, `recovery-key-screen-capture`, `recovery-key-background-hide`, and `recovery-key-clipboard-ttl`.
- every case has non-empty `details` and at least one existing, non-empty artifact under the active `artifacts/` directory; paths outside that directory, symlink escapes, missing/empty files, duplicate/unknown cases, and a simulator UDID mismatch fail closed.
- automated launch checks without the security evidence report `blocked` with exit code 2 and `automationStatus: completed`; malformed or failed security evidence reports `failed` with exit code 1. Neither may be used as completion proof.

The security automation must write this shape after its XCTest/Appium-equivalent assertions have actually passed. Do not hand-edit passed values:

```json
{
  "schemaVersion": 1,
  "platform": "ios",
  "simulator": {
    "name": "iPhone 16 Pro",
    "udid": "<booted-simulator-udid>",
    "runtime": "iOS 18.5"
  },
  "cases": [
    {
      "id": "account-isolation",
      "status": "passed",
      "artifactPaths": ["/absolute/repo/path/artifacts/ios-security/account-isolation.json"],
      "details": "A logout, stale deep link, and B login assertions passed"
    }
  ]
}
```

The example intentionally shows only one case for readability and therefore is not valid completion evidence; the real report must contain all eight cases.

## Final Evidence Gate

After Android arm64 and iOS reports are present, run the strict gate:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:evidence
```

V02 may only move from `in_progress` to `done` when:

- `readyToMarkV02Done: true`
- `completionCriteria` all pass:
  - `android-arm64-apk`
  - `android-arm64-native-qa`
  - `ios-native-qa`
  - `native-qa-failures`
- `failures` is empty.

`agenthub:native:evidence:allow-partial` is only for refreshing or inspecting partial evidence. Do not use `agenthub:native:evidence:allow-partial` as completion proof.

If the latest evidence is `missing`, `blocked`, `failed`, or Android `completed` only on an x86_64 QA APK, use its `nextActions` entries first. Each entry includes the package-manager command and a direct root-script fallback command for external device environments where the wrapper hangs.

If a platform report JSON is malformed, its top-level value is not an object, or its `status` field is missing/invalid, the evidence auditor treats that platform as `failed` with `reason: report JSON was not parseable`, `reason: report JSON was not an object`, or `reason: report status was missing or invalid` and still emits rerun commands in `nextActions`. Regenerate that platform report instead of editing the latest evidence file by hand.

If a completed platform report uses malformed field shapes, points `apkPath` outside `artifacts/`, points `apkPath` or the delivery APK path at a missing artifact, directory, or non-APK/ZIP file, points to a missing iOS `.app`, or points the iOS `.app` path at a file, the evidence auditor fails closed with explicit artifact and schema errors. Regenerate the platform report through the QA runner instead of editing it by hand.

Historical reports that predate `automated-contract` remain readable and retain their original PNG integrity checks, but they are not the template for new evidence and do not reintroduce a screenshot requirement.

Before marking V02 done:

- inspect `artifacts/agenthub-v02-native-qa-evidence-latest.md`
- confirm all four checklist rows are checked
- confirm `readyToMarkV02Done: true`
- then update `design/Design.md`, `docs/project-status.md`, and `docs/validation-coverage.md` to record V02 native QA as complete
