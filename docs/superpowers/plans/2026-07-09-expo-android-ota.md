# Expo Android OTA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable EAS Update OTA support for the Android Expo app and build a signed arm64 production APK artifact.

**Architecture:** Use Expo's `expo-updates` runtime with the existing EAS project ID and per-variant channels. Keep OTA controllable through build environment flags, while making production/preview Android builds OTA-capable by default.

**Tech Stack:** Expo SDK 55, React Native 0.83, EAS Update, pnpm 10.11.0, Android Gradle build.

## Global Constraints

- 永远使用中文回答。
- Android 本机打包产物必须统一放到仓库根目录 `artifacts/`。
- 个人正式包默认命名为 `agenthub-production-arm64-YYYYMMDD-HHMM.apk`，并同时刷新 `agenthub-production-arm64-latest.apk`。
- 后续打 Android APK 优先使用 `npx -y pnpm@10.11.0 --filter agenthub-app android:apk:arm64` 或 `scripts/build-android.sh`。
- 不直接修改无关用户改动。

---

### Task 1: Configure Expo Updates

**Files:**
- Modify: `packages/agenthub-app/package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `packages/agenthub-app/app.config.js`
- Modify: `scripts/build-android.sh`

**Interfaces:**
- Consumes: Existing EAS project ID `9c99be0c-320b-425a-b469-5ecfba53488c`.
- Produces: Android manifest with `expo.modules.updates.ENABLED=true`, runtime version `1`, update URL `https://u.expo.dev/9c99be0c-320b-425a-b469-5ecfba53488c`, and channel request header matching `APP_ENV`.

- [x] **Step 1: Install `expo-updates` with Expo-compatible version**

Run: `npx -y pnpm@10.11.0 --filter agenthub-app exec expo install expo-updates`

Expected: `packages/agenthub-app/package.json` and `pnpm-lock.yaml` include `expo-updates`.

- [x] **Step 2: Add OTA config to app config**

Set `updates.enabled` from `EXPO_NO_OTA` / `NO_OTA`, set EAS update URL, and set `requestHeaders["expo-channel-name"]` to the current variant.

- [x] **Step 3: Make Android build scripts OTA-enabled by default**

Change `scripts/build-android.sh` default `NO_OTA` from `true` to `false`, update help text, and keep `NO_OTA=true` as the escape hatch.

- [x] **Step 4: Prebuild Android**

Run: `npx -y pnpm@10.11.0 --filter agenthub-app android:apk:arm64`

Expected: Android prebuild runs when config stamp changes, Gradle build succeeds, and APK is copied to `artifacts/`.

### Task 2: Restore App-Side Update Controls

**Files:**
- Modify: `packages/agenthub-app/sources/hooks/useUpdates.ts`
- Modify: `packages/agenthub-app/sources/app/(app)/dev/expo-constants.tsx`

**Interfaces:**
- Consumes: `expo-updates` APIs `checkForUpdateAsync`, `fetchUpdateAsync`, `reloadAsync`, `isEnabled`, `isEmbeddedLaunch`, `updateId`, `channel`, and `manifest`.
- Produces: Existing `UpdateBanner` sees `updateAvailable=true` after an update is fetched; `reloadApp()` reloads native app through `expo-updates`.

- [x] **Step 1: Replace no-op hook with native/web implementation**

Use dynamic native require so web remains safe. On native, check and fetch available updates; on web, reload the browser.

- [x] **Step 2: Restore Expo Updates diagnostics**

Display update manifest, update ID, channel, and embedded-launch status from `expo-updates` on the dev constants screen when available.

- [x] **Step 3: Typecheck**

Run: `npx -y pnpm@10.11.0 --filter agenthub-app typecheck`

Expected: TypeScript exits 0.

### Task 3: Verify Android Artifact

**Files:**
- Output: `artifacts/agenthub-production-arm64-YYYYMMDD-HHMM.apk`
- Output: `artifacts/agenthub-production-arm64-latest.apk`

**Interfaces:**
- Consumes: Existing Android verification script `agenthub:android:apk:verify`.
- Produces: Verified production arm64 APK with OTA metadata enabled.

- [x] **Step 1: Build Android production arm64 APK**

Run: `npx -y pnpm@10.11.0 --filter agenthub-app android:apk:arm64`

Expected: Build exits 0 and writes both timestamped and latest APK files under `artifacts/`.

- [x] **Step 2: Verify APK**

Run: `npx -y pnpm@10.11.0 --filter agenthub-app agenthub:android:apk:verify artifacts/agenthub-production-arm64-latest.apk`

Expected: Verification exits 0.
