# Session List Manual Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove pull-to-sync from the session list and expose manual status sync as a header button beside the new-session button.

**Architecture:** Keep the nested computer-session `ScrollView` independent by removing the parent `FlatList` refresh control. Extract the existing project/session refresh logic into a hook used by the sessions header action, while `SessionsList` keeps only passive discovery/invalidation effects.

**Tech Stack:** React Native, Expo Router, Unistyles, Vitest, TypeScript.

## Global Constraints

- 永远使用中文回答。
- UI / 前端改造必须遵循 `frontend-design` skill：头部按钮使用熟悉图标、紧凑状态、不会挤压标题。
- App 用户可见文案必须通过 `t(...)`，新增 key 需覆盖所有语言文件。
- 修改后运行 targeted tests 和 `pnpm typecheck`。

---

### Task 1: Session List Refresh Hook

**Files:**
- Create: `packages/agenthub-app/sources/hooks/useRefreshProjectSessionList.ts`
- Modify: `packages/agenthub-app/sources/components/SessionsList.tsx`

**Interfaces:**
- Produces: `useRefreshProjectSessionList(): { isRefreshing: boolean; refreshProjectSessions: () => Promise<void> }`
- Consumes: `useProjectListViewData`, `useAllMachines`, `refreshProjectSessionList`

- [ ] Write a failing test or static assertion that the list no longer imports or renders `RefreshControl`.
- [ ] Implement the hook by moving the current `handleRefresh` state and dependencies from `SessionsList`.
- [ ] Remove `RefreshControl` from the `FlatList`; keep list scrolling and nested computer-session `ScrollView` unchanged.
- [ ] Run the targeted test/static assertion.

### Task 2: Header Manual Sync Button

**Files:**
- Modify: `packages/agenthub-app/sources/components/MainView.tsx`
- Modify: `packages/agenthub-app/sources/text/_default.ts`
- Modify: all `packages/agenthub-app/sources/text/translations/*.ts`

**Interfaces:**
- Consumes: `useRefreshProjectSessionList`
- Produces: sessions header right actions: manual sync icon button immediately left of existing plus button.

- [ ] Add `project.syncStatus` translation to English default and all language files.
- [ ] Update sessions `HeaderRight` to render a `sync-outline` icon button with `ActivityIndicator` while refreshing, then the existing `add-outline` button.
- [ ] Disable/reuse the in-flight refresh promise through hook state to prevent repeated taps while syncing.
- [ ] Run typecheck.

### Task 3: Web Validation

**Files:**
- No production edits expected.

- [ ] Start or reuse authenticated Web environment with `npx -y pnpm@10.11.0 run env:up:authenticated`.
- [ ] Open the authenticated Web URL, inspect the sessions header, and confirm the sync button sits left of plus.
- [ ] Expand a project computer-session section and verify nested scrolling no longer triggers the status sync gesture.
- [ ] Clean up browser/Playwright/Chrome residual processes used for validation.

