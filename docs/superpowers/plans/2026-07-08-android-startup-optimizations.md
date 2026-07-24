# Android Startup Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce Android cold-start noise and contention by deferring non-critical syncs, removing unused VisionCamera startup work, and aligning Android back navigation config.

**Architecture:** Add a small startup sync scheduler so `sync.ts` can trigger sessions immediately and stagger lower-priority syncs after first render. Keep production behavior conservative: account creation still runs all startup syncs immediately, while restore/cold start defers background refreshes.

**Tech Stack:** Expo SDK 55, React Native 0.83, Vitest, Android Manifest, pnpm workspace.

## Global Constraints

- 永远使用中文回答。
- Use TDD for behavior changes.
- Avoid touching unrelated dirty files.
- Use pnpm via `npx -y pnpm@10.11.0`.

---

### Task 1: Startup Sync Scheduling

**Files:**
- Create: `packages/agenthub-app/sources/sync/startupSyncScheduler.ts`
- Test: `packages/agenthub-app/sources/sync/startupSyncScheduler.test.ts`
- Modify: `packages/agenthub-app/sources/sync/sync.ts`

**Interfaces:**
- Produces: `runStartupSyncs(options: StartupSyncOptions): void`
- Consumes: sync invalidation callbacks for sessions/settings/profile/machines/push/native/artifacts.

- [ ] **Step 1: Write failing scheduler tests**
- [ ] **Step 2: Implement scheduler**
- [ ] **Step 3: Wire restore to immediate sessions plus staggered background syncs**
- [ ] **Step 4: Keep create path immediate for settings/profile await semantics**
- [ ] **Step 5: Run targeted tests**

### Task 2: Native Startup Load Reduction

**Files:**
- Modify: `packages/agenthub-app/app.config.js`
- Modify: `packages/agenthub-app/package.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Removes unused `react-native-vision-camera` plugin/dependency.
- Keeps `expo-camera` scanner flow intact.

- [ ] **Step 1: Confirm no source imports VisionCamera**
- [ ] **Step 2: Remove VisionCamera plugin and dependency with pnpm**
- [ ] **Step 3: Run dependency/type checks**

### Task 3: Android Config and Log Noise

**Files:**
- Modify: `packages/agenthub-app/android/app/src/main/AndroidManifest.xml`
- Modify: `packages/agenthub-app/sources/utils/consoleLogging.ts`

**Interfaces:**
- Enables `android:enableOnBackInvokedCallback`.
- Avoids unconditional console logging during startup when console output is suppressed.

- [ ] **Step 1: Update manifest predictive back flag**
- [ ] **Step 2: Gate console logging initialization message**
- [ ] **Step 3: Run targeted tests/typecheck**
