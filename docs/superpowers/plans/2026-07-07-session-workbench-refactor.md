# Session Workbench Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把会话首页从“全机官方历史混合列表”重构为“手机接管工作台”，默认只呈现当前正在处理的项目任务，并把官方 Codex/Claude 历史收敛为项目内可接入候选。

**Architecture:** 新模型分为三层：Workbench 是用户默认看到的当前任务集合；Discovery 是按项目目录发现的官方本地会话候选；Connector 把候选转换为 AgentHub mirror/resume 会话。Provider 差异、官方归档能力差异、文件格式差异留在 CLI/RPC 和 projection 层，UI 只暴露“新任务、继续/接管、移出工作台、同步此项目”。

**Tech Stack:** TypeScript, Expo React Native/Web, Zustand-style app storage, Vitest, AgentHub CLI machine RPC, authenticated Expo Web dev environment.

## Global Constraints

- 永远使用中文输出用户可见文案、文档说明和验收报告。
- 会话首页默认是工作台，不是历史库；默认禁止把全机官方 Codex/Claude 历史灌入主列表。
- 项目边界以 `machineId + path` 为主键；官方候选只有属于当前项目目录或用户手动选择的目录时才进入项目视图。
- UI 不暴露 `official-codex`、`official-claude`、`mirror`、`provider branch`、`AgentHub branch` 这类内部概念；用户看到的是“电脑端会话”“接管”“移出工作台”。
- AgentHub 自建会话继续使用现有 socket 实时同步；官方历史发现使用按项目 scoped pull，不进入高频实时链路。
- 对官方 Claude 不支持归档的情况，UI 行为仍是“移出工作台”；不要向用户展示 provider 能力缺口。
- 修改 UI / 视觉 / 交互后，默认必须先使用 Web 端 authenticated dev 环境验证：`npx -y pnpm@10.11.0 run env:up:authenticated`，进入输出的 `authenticatedWebUrl` 截图、交互和检查日志。
- 执行本计划前必须先读取并使用适用的 superpowers 技能；选择子任务并行时使用 `superpowers:subagent-driven-development`，在当前会话连续执行时使用 `superpowers:executing-plans`，排查 bug 时先使用 `superpowers:systematic-debugging`，完成前使用 `superpowers:verification-before-completion`。
- 涉及会话列表、项目组、候选区、按钮文案、状态层级或任何 UI 改动时，必须先读取并使用 `frontend-design` skill，再开始实现或评审。
- 修改 daemon、runner、CLI 更新流程时，必须同时考虑 `agenthub-daemon.service`、runner active turn `turn-end`、失联 runner 归档退出。本计划第一阶段不修改 daemon 生命周期。
- 不回滚当前工作区里非本任务产生的改动；执行前先 `git status --short` 记录状态。

---

## Product Boundary

这次重构只解决会话工作台的信息架构、官方候选发现、接管入口、生命周期语义和同步时机。它不重写 Codex/Claude transcript parser，不改变官方工具的文件格式，不实现跨机器全量历史搜索，不把手机端做成完整官方客户端替代品。

默认首页只回答三个问题：

1. 我现在有哪些正在处理的任务？
2. 哪些任务需要我看一眼、接管一下或处理权限？
3. 当前项目里有没有一两个电脑端会话可以拉进来？

高级历史、debug metadata、provider 原始 id、全机扫描、忽略列表维护，全部放到非默认入口。

## Workflow Review Supplement

本计划使用具体的计划编写规范复核后，新增以下执行闸门；`superpowers:using-superpowers` 不再作为入口或前置技能：

- 计划执行不能直接跳进代码；必须先选择 `superpowers:subagent-driven-development` 或 `superpowers:executing-plans`。
- 如果执行过程中遇到“归档报错”“官方候选重复”“接管后状态不同步”等 bug，先使用 `superpowers:systematic-debugging` 建立复现和因果链，再改代码。
- 如果任务涉及分支、worktree 或交付前合并，先使用相应 superpowers 工作流检查当前 git/worktree 环境。
- Task 6、Task 7、Task 9 属于 UI / 交互 / 图形化验证任务，执行前必须读取 `frontend-design` skill；会话工作台应保持工具型产品的克制、清晰和高信息密度，而不是做成营销页或概念展示页。
- 完成每个阶段后先跑对应测试和 Web 真实验证，再向用户声明完成。

## High-Level Abstractions

```txt
Workbench
│
├─ ProjectGroupKey
│  ├─ machineId: string
│  └─ path: string
│
├─ WorkbenchSession
│  ├─ source: "agenthub"
│  ├─ sessionId: string
│  ├─ lifecycle: "active" | "idle" | "needs_attention" | "archived"
│  └─ actions: "open" | "send" | "archive" | "stop"
│
├─ OfficialCandidate
│  ├─ source: "computer_session"
│  ├─ provider: "codex" | "claude"
│  ├─ externalId: string
│  ├─ projectPath: string
│  ├─ candidateState: "recent" | "running" | "stale" | "hidden"
│  └─ actions: "connect" | "hide"
│
└─ Connector
   ├─ connectOfficialCodexSession(...)
   ├─ machineSpawnNewSession(...)
   └─ produces AgentHub mirror session
```

```txt
Default sessions screen
│
├─ load AgentHub sessions
│  ├─ storage sessions
│  ├─ projectManager groups by machineId + path
│  └─ render active/resumable WorkbenchSession rows
│
├─ load scoped official candidates
│  ├─ only for visible project paths
│  ├─ only active machines
│  ├─ filter hidden candidate ids
│  └─ render collapsed "电脑端会话" candidates inside project group
│
└─ user taps candidate
   ├─ connectOfficialCodexSession(...)
   ├─ spawn AgentHub session with official mirror id
   ├─ hide duplicate candidate row
   └─ navigate to normal SessionView
```

## File Structure

- `docs/architecture/session-workbench.md`: 产品抽象、状态词汇、用户可见动作、非目标。
- `packages/agenthub-app/sources/sync/sessionWorkbench.ts`: 新增 app 侧工作台纯函数，负责项目 scope、官方候选过滤、row 分类。
- `packages/agenthub-app/sources/sync/sessionWorkbench.test.ts`: 新增工作台模型单元测试。
- `packages/agenthub-app/sources/sync/storageProjection.ts`: 修改 project list projection，避免把所有官方历史直接伪装成 active session。
- `packages/agenthub-app/sources/sync/storageProjection.test.ts`: 增加回归测试，覆盖官方历史不污染主列表。
- `packages/agenthub-app/sources/components/SessionsList.tsx`: 修改官方同步触发，从全机自动扫描改为 scoped project discovery。
- `packages/agenthub-app/sources/components/ActiveSessionsGroupCompact.tsx`: 修改项目组 UI，把官方候选放到折叠的“电脑端会话”区域。
- `packages/agenthub-app/sources/components/connectOfficialCodexSession.ts`: 保留接管核心，调整调用方和用户文案，不改变 mirror/resume 行为。
- `packages/agenthub-app/sources/components/connectOfficialCodexSession.test.ts`: 补充接管后候选去重和导航行为测试。
- `packages/agenthub-cli/src/api/apiMachine.ts`: 给 official list RPC 增加 path/provider/limit 过滤参数，保持旧调用兼容。
- `packages/agenthub-cli/src/api/apiMachine.officialSessions.test.ts`: 新增 CLI RPC scoped official discovery 测试。
- `packages/agenthub-app/sources/sync/sync.ts`: 审核 `controlledByUser` 切换语义，必要时修正“电脑端/手机端接管”消息补抓条件。

---

### Task 1: Freeze the Product Contract

**Files:**
- Create: `docs/architecture/session-workbench.md`

**Interfaces:**
- Produces: 用户可见名词表、生命周期语义、默认/高级入口边界。
- Consumes: 本计划的 Global Constraints 和 High-Level Abstractions。

- [ ] **Step 1: Create architecture document**

Write `docs/architecture/session-workbench.md` with these sections and exact decisions:

```markdown
# Session Workbench Architecture

## Positioning

AgentHub 手机端是电脑端官方工具的补充接管层，不是整台机器的历史会话浏览器。

## Default Surface

默认会话首页只显示当前工作台：

- AgentHub 正在运行、可继续、需要处理权限或刚完成的任务。
- 用户已经接入 AgentHub 的官方 Codex/Claude 会话。
- 当前项目目录下折叠展示的少量电脑端会话候选。

默认首页不显示全机历史、不显示隐藏候选、不显示 debug id、不显示 provider 原始文件格式。

## Project Boundary

项目使用 `machineId + path` 标识。官方候选必须满足以下至少一项：

- `cwd` 与项目 `path` 完全一致。
- `cwd` 是项目 `path` 的子目录，并且用户在该项目触发过“同步此项目”。
- 用户从高级恢复入口显式选择加入该项目。

## User Vocabulary

- AgentHub session row: 任务
- Official Codex/Claude row: 电脑端会话
- Resume or mirror action: 接管
- Default finish/remove action: 移出工作台
- Archived AgentHub record: 已归档会话
- Full-machine search: 高级恢复

## Lifecycle Rules

- “移出工作台”是默认结束类前台动作，表示用户不再希望这个条目出现在当前工作台。
- 对 AgentHub session，“移出工作台”会先停止运行中的 runner，再调用 server archive；会话记录和消息仍可在已归档会话中找回。
- 对电脑端会话候选，“移出工作台”会记录 ignore/hide；官方 Codex/Claude 源文件不删除，也不模拟 provider 不支持的归档能力。
- “永久删除会话”只放在危险区，用于删除本应用记录、消息、usage 和 access keys；它不是默认收尾动作，且不可撤销。
- 接管官方候选后，主列表只显示新的 AgentHub session，原候选从该项目候选区消失。

## Non-Goals

- 不重写 Codex/Claude 官方存储格式。
- 不把 Claude 不支持归档的事实暴露给普通用户。
- 不在默认首页提供全机搜索。
- 不让用户理解 provider branch、mirror branch、official branch 这些内部概念。
```

- [ ] **Step 2: Review copy against UI constraints**

Run:

```bash
rg "official|mirror|provider|branch|Claude Code|Codex thread|归档|隐藏|接管" docs/architecture/session-workbench.md
```

Expected:

- `official` and `provider` only appear in architecture explanations, not in User Vocabulary as user-facing labels.
- User-facing labels include `任务`, `电脑端会话`, `接管`, `移出工作台`.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/session-workbench.md
git commit -m "docs: define session workbench product contract"
```

---

### Task 2: Add a Pure Workbench Model

**Files:**
- Create: `packages/agenthub-app/sources/sync/sessionWorkbench.ts`
- Create: `packages/agenthub-app/sources/sync/sessionWorkbench.test.ts`

**Interfaces:**
- Produces:
  - `type ProjectScope = { machineId: string; path: string }`
  - `type OfficialProvider = 'codex' | 'claude'`
  - `type OfficialCandidateKey = string`
  - `function getOfficialCandidateKey(provider: OfficialProvider, externalId: string): OfficialCandidateKey`
  - `function isPathInProjectScope(candidatePath: string | undefined, projectPath: string): boolean`
  - `function filterOfficialCandidatesForProject<T extends OfficialCandidateLike>(threads: T[], scope: ProjectScope, hiddenKeys: ReadonlySet<string>, connectedKeys: ReadonlySet<string>): T[]`
- Consumes: Existing official thread shapes with `provider`, `id`, `machineId`, and `cwd` fields.

- [ ] **Step 1: Write failing tests**

Create `packages/agenthub-app/sources/sync/sessionWorkbench.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  filterOfficialCandidatesForProject,
  getOfficialCandidateKey,
  isPathInProjectScope,
} from './sessionWorkbench';

type Thread = {
  id: string;
  provider: 'codex' | 'claude';
  machineId: string;
  cwd?: string;
  updatedAt?: number;
};

describe('sessionWorkbench', () => {
  it('creates provider-aware official candidate keys', () => {
    expect(getOfficialCandidateKey('codex', 'abc')).toBe('codex:abc');
    expect(getOfficialCandidateKey('claude', 'abc')).toBe('claude:abc');
  });

  it('matches exact project paths and child paths only', () => {
    expect(isPathInProjectScope('/repo/app', '/repo/app')).toBe(true);
    expect(isPathInProjectScope('/repo/app/packages/foo', '/repo/app')).toBe(true);
    expect(isPathInProjectScope('/repo/application', '/repo/app')).toBe(false);
    expect(isPathInProjectScope('/other/app', '/repo/app')).toBe(false);
    expect(isPathInProjectScope(undefined, '/repo/app')).toBe(false);
  });

  it('filters official candidates by machine, project path, hidden keys, and connected keys', () => {
    const threads: Thread[] = [
      { id: 'current-codex', provider: 'codex', machineId: 'm1', cwd: '/repo/app' },
      { id: 'child-claude', provider: 'claude', machineId: 'm1', cwd: '/repo/app/packages/a' },
      { id: 'hidden-codex', provider: 'codex', machineId: 'm1', cwd: '/repo/app' },
      { id: 'connected-claude', provider: 'claude', machineId: 'm1', cwd: '/repo/app' },
      { id: 'wrong-machine', provider: 'codex', machineId: 'm2', cwd: '/repo/app' },
      { id: 'wrong-path', provider: 'codex', machineId: 'm1', cwd: '/tmp/test' },
    ];

    const visible = filterOfficialCandidatesForProject(
      threads,
      { machineId: 'm1', path: '/repo/app' },
      new Set(['codex:hidden-codex']),
      new Set(['claude:connected-claude']),
    );

    expect(visible.map((thread) => thread.id)).toEqual(['current-codex', 'child-claude']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/sessionWorkbench.test.ts
```

Expected: FAIL because `./sessionWorkbench` does not exist.

- [ ] **Step 3: Implement pure workbench helpers**

Create `packages/agenthub-app/sources/sync/sessionWorkbench.ts`:

```ts
export type ProjectScope = {
  machineId: string;
  path: string;
};

export type OfficialProvider = 'codex' | 'claude';

export type OfficialCandidateKey = `${OfficialProvider}:${string}`;

export type OfficialCandidateLike = {
  id: string;
  provider: OfficialProvider;
  machineId: string;
  cwd?: string | null;
};

export function getOfficialCandidateKey(
  provider: OfficialProvider,
  externalId: string,
): OfficialCandidateKey {
  return `${provider}:${externalId}`;
}

function normalizePath(path: string): string {
  if (path === '/') {
    return '/';
  }
  return path.replace(/\/+$/u, '');
}

export function isPathInProjectScope(
  candidatePath: string | undefined | null,
  projectPath: string,
): boolean {
  if (!candidatePath) {
    return false;
  }

  const candidate = normalizePath(candidatePath);
  const project = normalizePath(projectPath);

  return candidate === project || candidate.startsWith(`${project}/`);
}

export function filterOfficialCandidatesForProject<T extends OfficialCandidateLike>(
  threads: readonly T[],
  scope: ProjectScope,
  hiddenKeys: ReadonlySet<string>,
  connectedKeys: ReadonlySet<string>,
): T[] {
  return threads.filter((thread) => {
    if (thread.machineId !== scope.machineId) {
      return false;
    }

    if (!isPathInProjectScope(thread.cwd, scope.path)) {
      return false;
    }

    const key = getOfficialCandidateKey(thread.provider, thread.id);

    return !hiddenKeys.has(key) && !connectedKeys.has(key);
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/sessionWorkbench.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agenthub-app/sources/sync/sessionWorkbench.ts packages/agenthub-app/sources/sync/sessionWorkbench.test.ts
git commit -m "feat: add session workbench filtering model"
```

---

### Task 3: Stop Official History from Polluting Project Rows

**Files:**
- Modify: `packages/agenthub-app/sources/sync/storageProjection.ts`
- Modify: `packages/agenthub-app/sources/sync/storageProjection.test.ts`

**Interfaces:**
- Consumes: `getOfficialCandidateKey`, `filterOfficialCandidatesForProject`.
- Produces: Project list data where AgentHub sessions remain primary rows and official threads are separate project-level candidates.

- [ ] **Step 1: Add failing projection test**

In `packages/agenthub-app/sources/sync/storageProjection.test.ts`, add a test named:

```ts
it('keeps scoped official candidates separate from active session rows', () => {
  // Build a storage snapshot with:
  // - one AgentHub session in machine m1 path /repo/app
  // - one official codex thread in /repo/app
  // - one official claude session in /tmp/test
  // Expect:
  // - the project group for /repo/app has one normal session row
  // - the /repo/app official thread is exposed as project official candidate data
  // - the /tmp/test official thread does not create a default project row
});
```

Use the existing test builders in the file. The final assertions must check concrete counts:

```ts
expect(appProject.sessions).toHaveLength(1);
expect(appProject.officialCodexThreads).toHaveLength(1);
expect(projects.some((project) => project.path === '/tmp/test')).toBe(false);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/storageProjection.test.ts
```

Expected: FAIL because current projection can create groups from official-only history.

- [ ] **Step 3: Modify projection behavior**

In `packages/agenthub-app/sources/sync/storageProjection.ts`:

- Keep grouping projects from AgentHub sessions and explicit custom projects.
- Do not create a new default project group from an official thread alone.
- For an existing project group, attach official candidates only when `machineId` matches and `cwd` is inside the project path.
- Continue hiding official candidates already connected by an active AgentHub mirror session.

The decision rule must be equivalent to:

```ts
const canAttachOfficialCandidate =
  group.machineId === thread.machineId &&
  isPathInProjectScope(thread.cwd, group.path) &&
  !hiddenOfficialCandidateKeys.has(getOfficialCandidateKey(thread.provider, thread.id)) &&
  !connectedOfficialCandidateKeys.has(getOfficialCandidateKey(thread.provider, thread.id));
```

- [ ] **Step 4: Run projection tests**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/storageProjection.test.ts sources/sync/sessionWorkbench.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agenthub-app/sources/sync/storageProjection.ts packages/agenthub-app/sources/sync/storageProjection.test.ts
git commit -m "fix: keep official history out of default project rows"
```

---

### Task 4: Scope Official Discovery in the Sessions List

**Files:**
- Modify: `packages/agenthub-app/sources/components/SessionsList.tsx`
- Modify: `packages/agenthub-app/sources/sync/sessionWorkbench.ts`
- Modify: `packages/agenthub-app/sources/sync/sessionWorkbench.test.ts`

**Interfaces:**
- Consumes: Project groups from `useProjectListViewData()`.
- Produces: Official discovery requests only for active machines and visible project paths.

- [ ] **Step 1: Add helper test for discovery scopes**

Extend `packages/agenthub-app/sources/sync/sessionWorkbench.test.ts`:

```ts
import { buildOfficialDiscoveryScopes } from './sessionWorkbench';

it('builds one discovery scope per active machine and project path', () => {
  const scopes = buildOfficialDiscoveryScopes(
    [
      { machineId: 'm1', path: '/repo/app' },
      { machineId: 'm1', path: '/repo/app' },
      { machineId: 'm1', path: '/repo/other' },
      { machineId: 'm2', path: '/repo/app' },
    ],
    new Set(['m1']),
  );

  expect(scopes).toEqual([
    { machineId: 'm1', paths: ['/repo/app', '/repo/other'] },
  ]);
});
```

- [ ] **Step 2: Implement discovery scope helper**

Add to `packages/agenthub-app/sources/sync/sessionWorkbench.ts`:

```ts
export type OfficialDiscoveryScope = {
  machineId: string;
  paths: string[];
};

export function buildOfficialDiscoveryScopes(
  projects: readonly ProjectScope[],
  activeMachineIds: ReadonlySet<string>,
): OfficialDiscoveryScope[] {
  const pathsByMachine = new Map<string, Set<string>>();

  for (const project of projects) {
    if (!activeMachineIds.has(project.machineId)) {
      continue;
    }

    const paths = pathsByMachine.get(project.machineId) ?? new Set<string>();
    paths.add(normalizePath(project.path));
    pathsByMachine.set(project.machineId, paths);
  }

  return Array.from(pathsByMachine.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([machineId, paths]) => ({
      machineId,
      paths: Array.from(paths).sort((left, right) => left.localeCompare(right)),
    }));
}
```

- [ ] **Step 3: Replace full-machine scan trigger**

In `packages/agenthub-app/sources/components/SessionsList.tsx`, replace the effect that loops over every active machine and calls `listOfficialCodexThreads(machine.id)` with:

```ts
const discoveryScopes = buildOfficialDiscoveryScopes(
  projectListViewData.projects.map((project) => ({
    machineId: project.machineId,
    path: project.path,
  })),
  new Set(
    machines
      .filter((machine) => machine.active)
      .map((machine) => machine.id),
  ),
);
```

Then call the machine RPC only for scopes with at least one path. Until the CLI scoped RPC is implemented, filter results app-side before `storage.applyOfficialCodexThreads(...)`.

- [ ] **Step 4: Run app tests**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/sessionWorkbench.test.ts sources/sync/storageProjection.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agenthub-app/sources/components/SessionsList.tsx packages/agenthub-app/sources/sync/sessionWorkbench.ts packages/agenthub-app/sources/sync/sessionWorkbench.test.ts
git commit -m "feat: scope official discovery to visible projects"
```

---

### Task 5: Add Scoped Official Discovery to CLI RPC

**Files:**
- Modify: `packages/agenthub-cli/src/api/apiMachine.ts`
- Create: `packages/agenthub-cli/src/api/apiMachine.officialSessions.test.ts`

**Interfaces:**
- Consumes RPC payload:

```ts
type OfficialSessionsListRequest = {
  paths?: string[];
  providers?: Array<'codex' | 'claude'>;
  limit?: number;
};
```

- Produces RPC response compatible with current official list response, filtered by `cwd`.

- [ ] **Step 1: Write failing CLI RPC filter tests**

Create `packages/agenthub-cli/src/api/apiMachine.officialSessions.test.ts` with tests for a pure filter helper exported from `apiMachine.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { filterOfficialAgentSessionsForRequest } from './apiMachine';

describe('filterOfficialAgentSessionsForRequest', () => {
  it('filters by project paths, providers, and limit', () => {
    const sessions = [
      { id: 'codex-current', provider: 'codex', cwd: '/repo/app', updatedAt: 30 },
      { id: 'claude-child', provider: 'claude', cwd: '/repo/app/pkg', updatedAt: 20 },
      { id: 'codex-test', provider: 'codex', cwd: '/tmp/test', updatedAt: 10 },
    ] as const;

    const filtered = filterOfficialAgentSessionsForRequest(sessions, {
      paths: ['/repo/app'],
      providers: ['codex', 'claude'],
      limit: 2,
    });

    expect(filtered.map((session) => session.id)).toEqual(['codex-current', 'claude-child']);
  });

  it('keeps old behavior when no request filters are provided', () => {
    const sessions = [
      { id: 'a', provider: 'codex', cwd: '/a', updatedAt: 1 },
      { id: 'b', provider: 'claude', cwd: '/b', updatedAt: 2 },
    ] as const;

    expect(filterOfficialAgentSessionsForRequest(sessions, {}).map((session) => session.id)).toEqual(['b', 'a']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub exec vitest run src/api/apiMachine.officialSessions.test.ts
```

Expected: FAIL because `filterOfficialAgentSessionsForRequest` does not exist.

- [ ] **Step 3: Implement filter helper and RPC payload parsing**

In `packages/agenthub-cli/src/api/apiMachine.ts`:

- Export `filterOfficialAgentSessionsForRequest`.
- Parse optional `paths`, `providers`, `limit` from the existing official list RPC payload.
- Apply path filtering before the final limit.
- Keep default limit `300` when no request `limit` is provided.
- Keep old no-argument behavior working for existing app versions.

The helper must preserve descending `updatedAt` sorting:

```ts
export function filterOfficialAgentSessionsForRequest<T extends {
  provider: 'codex' | 'claude';
  cwd?: string | null;
  updatedAt?: number | null;
}>(
  sessions: readonly T[],
  request: { paths?: string[]; providers?: Array<'codex' | 'claude'>; limit?: number },
): T[] {
  const providerSet = request.providers?.length ? new Set(request.providers) : null;
  const normalizedPaths = request.paths?.map(normalizeOfficialSessionPath).filter(Boolean) ?? [];
  const limit = request.limit && request.limit > 0 ? request.limit : 300;

  return sessions
    .filter((session) => {
      if (providerSet && !providerSet.has(session.provider)) {
        return false;
      }
      if (normalizedPaths.length === 0) {
        return true;
      }
      return normalizedPaths.some((path) => isOfficialSessionPathInScope(session.cwd, path));
    })
    .sort((left, right) => (right.updatedAt ?? 0) - (left.updatedAt ?? 0))
    .slice(0, limit);
}
```

- [ ] **Step 4: Wire app call to scoped RPC**

In `packages/agenthub-app/sources/components/SessionsList.tsx`, pass:

```ts
{
  paths: scope.paths,
  providers: ['codex', 'claude'],
  limit: 50,
}
```

to the official list operation. If `listOfficialCodexThreads` currently accepts only `machineId`, extend its TypeScript signature in the app sync ops file used by `SessionsList.tsx`.

- [ ] **Step 5: Run CLI and app tests**

Run:

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub exec vitest run src/api/apiMachine.officialSessions.test.ts
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/sessionWorkbench.test.ts sources/sync/storageProjection.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/agenthub-cli/src/api/apiMachine.ts packages/agenthub-cli/src/api/apiMachine.officialSessions.test.ts packages/agenthub-app/sources/components/SessionsList.tsx
git commit -m "feat: filter official session discovery by project scope"
```

---

### Task 6: Redesign Official Candidate UI as Project-Local Discovery

**Files:**
- Modify: `packages/agenthub-app/sources/components/ActiveSessionsGroupCompact.tsx`
- Modify: `packages/agenthub-app/sources/components/connectOfficialCodexSession.ts`
- Modify: `packages/agenthub-app/sources/components/connectOfficialCodexSession.test.ts`

**Interfaces:**
- Consumes: project-level official candidates from projection.
- Produces: collapsed project-local candidate section with user-facing labels `电脑端会话`, `接管`, `移出工作台`.

- [ ] **Step 0: Invoke frontend-design for the UI change**

Read `frontend-design` before changing UI code. Apply it in a restrained operational-tool direction:

- Purpose: 帮用户离开电脑后快速判断当前项目任务、接管少量电脑端会话、处理完成/移出工作台。
- Tone: quiet, utilitarian, dense but legible; no marketing hero, no decorative card-heavy layout.
- Differentiation: 主列表像一个清爽的任务调度台，而不是全机历史库。
- Constraints: labels must fit on mobile and desktop; candidate rows must not visually compete with active AgentHub task rows.

- [ ] **Step 1: Add interaction test for connect copy and duplicate suppression**

Extend `packages/agenthub-app/sources/components/connectOfficialCodexSession.test.ts` so the tested action still:

- Calls `machineSpawnNewSession` with `officialMirrorCodexThreadId` or `officialMirrorClaudeSessionId`.
- Calls `startOfficialResumeSession`.
- Navigates to the new AgentHub session.
- Does not require provider-specific UI copy from the caller.

Use assertion names:

```ts
expect(spawnOptions.officialMirrorCodexThreadId).toBe('thread-1');
expect(startOfficialResumeSession).toHaveBeenCalledWith('new-session-id');
expect(navigateToSession).toHaveBeenCalledWith('new-session-id');
```

- [ ] **Step 2: Move official rows out of the primary session row list**

In `packages/agenthub-app/sources/components/ActiveSessionsGroupCompact.tsx`:

- Primary session area renders only AgentHub session rows.
- Official candidates render under a collapsed sub-section label `电脑端会话`.
- The sub-section is visible only when the current project has candidates.
- Candidate row primary action label is `接管`.
- Candidate overflow action is `移出工作台`.
- Do not render `official-codex`, `official-claude`, `Codex thread`, `Claude session`, `mirror`, or `provider` in visible text.

- [ ] **Step 3: Preserve project actions**

Keep these existing project actions working:

- 新建会话 uses project `machineId` and `path`.
- 已归档会话 remains accessible.
- 隐藏项目 still moves active AgentHub sessions out of the workbench and hides official candidates.
- 结束活跃会话 only applies to AgentHub active sessions, not official candidates.

- [ ] **Step 4: Run component-adjacent tests and typecheck**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/components/connectOfficialCodexSession.test.ts sources/sync/storageProjection.test.ts
npx -y pnpm@10.11.0 --filter agenthub-app typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agenthub-app/sources/components/ActiveSessionsGroupCompact.tsx packages/agenthub-app/sources/components/connectOfficialCodexSession.ts packages/agenthub-app/sources/components/connectOfficialCodexSession.test.ts
git commit -m "feat: show official sessions as project-local candidates"
```

---

### Task 7: Normalize Lifecycle Actions and Labels

**Files:**
- Modify: `packages/agenthub-app/sources/components/ActiveSessionsGroupCompact.tsx`
- Modify: `packages/agenthub-app/sources/components/SessionsList.tsx`
- Modify: `packages/agenthub-app/sources/sync/storageProjection.ts`
- Modify: `packages/agenthub-cli/src/api/apiMachine.ts`

**Interfaces:**
- Consumes existing actions: `sessionArchive`, `ignoreOfficialCodexThread`, `archiveArchivedOfficialCodexMirrorsForMachine`.
- Produces user-facing lifecycle semantics:
  - AgentHub session: `移出工作台`
  - Official candidate: `移出工作台`
  - Project: `隐藏项目`
  - Permanent deletion: `永久删除会话` in danger zone only

- [ ] **Step 1: Search for leaked provider lifecycle labels**

Run:

```bash
rg "archive official|official archive|Codex thread|Claude session|mirror|provider|官方归档|删除官方|official-codex|official-claude" packages/agenthub-app/sources packages/agenthub-cli/src/api
```

Expected: Results can remain in internal function names and tests, but not in visible button labels or primary list text.

- [ ] **Step 2: Update visible labels**

In app components:

- Replace visible `resume official` wording with `接管`.
- Replace visible official archive/hide wording with `移出工作台`.
- Keep internal function names unchanged unless a rename is necessary for clarity.
- If a row source is official, menu item must call `ignoreOfficialCodexThread(...)`.
- If a row source is AgentHub, menu item must call `sessionArchive(...)`.

- [ ] **Step 3: Add regression assertions**

Add test assertions in existing app tests or a new lightweight text helper test so these strings do not appear in visible action config:

```ts
expect(visibleActionLabels).not.toContain('official-codex');
expect(visibleActionLabels).not.toContain('official-claude');
expect(visibleActionLabels).not.toContain('mirror');
expect(visibleActionLabels).toContain('接管');
expect(visibleActionLabels).toContain('移出工作台');
```

- [ ] **Step 4: Run tests and typecheck**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/storageProjection.test.ts sources/components/connectOfficialCodexSession.test.ts
npx -y pnpm@10.11.0 --filter agenthub-app typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agenthub-app/sources/components/ActiveSessionsGroupCompact.tsx packages/agenthub-app/sources/components/SessionsList.tsx packages/agenthub-app/sources/sync/storageProjection.ts packages/agenthub-cli/src/api/apiMachine.ts
git commit -m "fix: normalize session lifecycle labels"
```

---

### Task 8: Audit Mobile/Desktop Control Handoff Semantics

**Files:**
- Modify: `packages/agenthub-app/sources/sync/sync.ts`
- Add or modify: `packages/agenthub-app/sources/sync/sessionUpdateGuards.test.ts`
- Add or modify: `packages/agenthub-app/sources/sync/sessionUpdateGuards.ts`

**Interfaces:**
- Consumes: `controlledByUser` transitions in session metadata or agent state.
- Produces: deterministic message refresh when control returns to mobile after local desktop control.

- [ ] **Step 1: Record current semantics**

Inspect:

```bash
rg "controlledByUser|control returned|isNowControlledByUser|wasControlledByUser" packages/agenthub-app/sources/sync packages/agenthub-cli/src/claude packages/agenthub-cli/src/codex
```

Expected source facts:

- CLI sets `controlledByUser: true` for local control.
- CLI sets `controlledByUser: false` for remote/mobile control.
- App should refresh messages when transition is `true -> false`.

- [ ] **Step 2: Add guard test**

In `packages/agenthub-app/sources/sync/sessionUpdateGuards.test.ts`, add:

```ts
import { describe, expect, it } from 'vitest';
import { shouldRefreshMessagesForControlHandoff } from './sessionUpdateGuards';

describe('shouldRefreshMessagesForControlHandoff', () => {
  it('refreshes when control returns from desktop to mobile', () => {
    expect(
      shouldRefreshMessagesForControlHandoff({
        previousControlledByUser: true,
        nextControlledByUser: false,
      }),
    ).toBe(true);
  });

  it('does not refresh for mobile to desktop handoff', () => {
    expect(
      shouldRefreshMessagesForControlHandoff({
        previousControlledByUser: false,
        nextControlledByUser: true,
      }),
    ).toBe(false);
  });
});
```

- [ ] **Step 3: Implement or correct guard**

In `packages/agenthub-app/sources/sync/sessionUpdateGuards.ts`:

```ts
export function shouldRefreshMessagesForControlHandoff(input: {
  previousControlledByUser: boolean | undefined;
  nextControlledByUser: boolean | undefined;
}): boolean {
  return input.previousControlledByUser === true && input.nextControlledByUser === false;
}
```

In `packages/agenthub-app/sources/sync/sync.ts`, replace inline boolean logic with this helper.

- [ ] **Step 4: Run tests**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/sessionUpdateGuards.test.ts
npx -y pnpm@10.11.0 --filter agenthub-app typecheck
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/agenthub-app/sources/sync/sync.ts packages/agenthub-app/sources/sync/sessionUpdateGuards.ts packages/agenthub-app/sources/sync/sessionUpdateGuards.test.ts
git commit -m "fix: refresh messages when control returns to mobile"
```

---

### Task 9: Web Visual and Interaction Validation

**Files:**
- Modify only if validation finds defects in previous task files.
- Create: `docs/validation/session-workbench-2026-07-07.md`

**Interfaces:**
- Consumes: authenticated web dev environment.
- Produces: validation evidence for sessions list, project-local discovery, connect/remove-from-workbench actions.

- [ ] **Step 1: Start authenticated web environment**

Run:

```bash
npx -y pnpm@10.11.0 run env:up:authenticated
```

Expected: command prints `authenticatedWebUrl`.

- [ ] **Step 2: Validate default list**

Open `authenticatedWebUrl` and verify:

- Main list shows AgentHub task rows, grouped by project.
- A project with only stale official history does not appear by default.
- No visible label contains `official-codex`, `official-claude`, `mirror`, `provider`, or `branch`.
- Candidate section, when present, is labeled `电脑端会话`.

- [ ] **Step 3: Validate manual connect**

In a project with a candidate:

- Expand `电脑端会话`.
- Click `接管`.
- Verify navigation to normal session detail.
- Verify returning to list shows the AgentHub session row and no duplicate candidate row.

- [ ] **Step 4: Validate remove-from-workbench behavior**

In the list:

- Use `移出工作台` on a candidate and verify it disappears without archiving any AgentHub session.
- Use `移出工作台` on an AgentHub task and verify it leaves the workbench.
- Open archived sessions and verify archived AgentHub tasks remain discoverable there.

- [ ] **Step 5: Write validation note**

Create `docs/validation/session-workbench-2026-07-07.md`:

```markdown
# Session Workbench Validation - 2026-07-07

## Environment

- Command: `npx -y pnpm@10.11.0 run env:up:authenticated`
- URL: authenticated dev web URL from command output

## Checks

- Default list is project-scoped.
- Official candidates are project-local and collapsed.
- Connect creates a normal AgentHub session.
- Hide removes only the candidate.
- Archive removes only the AgentHub task.
- No internal provider labels are visible.

## Result

PASS
```

- [ ] **Step 6: Commit**

```bash
git add docs/validation/session-workbench-2026-07-07.md
git commit -m "test: validate session workbench web flow"
```

---

### Task 10: Final Regression Gate

**Files:**
- No planned edits.

**Interfaces:**
- Consumes all previous tasks.
- Produces final confidence report and remaining risks.

- [ ] **Step 1: Run targeted tests**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run sources/sync/sessionWorkbench.test.ts sources/sync/storageProjection.test.ts sources/sync/sessionUpdateGuards.test.ts sources/components/connectOfficialCodexSession.test.ts
npx -y pnpm@10.11.0 --filter @artsum/agenthub exec vitest run src/api/apiMachine.officialSessions.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
npx -y pnpm@10.11.0 --filter agenthub-app typecheck
npx -y pnpm@10.11.0 --filter @artsum/agenthub typecheck
```

Expected: PASS.

- [ ] **Step 3: Run git diff check**

Run:

```bash
npx -y pnpm@10.11.0 run format:check
git status --short
```

Expected:

- No whitespace errors.
- Only files from this plan and pre-existing user changes are modified.

- [ ] **Step 4: Final implementation summary**

Write final report in Chinese with:

- 解决了什么：主列表从全机历史变为项目工作台。
- 用户现在看到什么：任务、电脑端会话、接管、移出工作台、永久删除会话（危险区）。
- 验证了什么：unit tests、typecheck、authenticated web flow。
- 剩余风险：官方 parser 本身仍依赖上游文件格式；高级历史入口还不是默认体验的一部分。

---

## Execution Order

推荐顺序是 Task 1 到 Task 10。Task 2 和 Task 5 可以并行，但 Task 3、Task 4、Task 6 必须在 Task 2 之后。Task 9 必须在所有 UI 改动之后执行。

## Acceptance Criteria

- 会话首页不会因为全机官方历史扫描生成一堆旧项目。
- 当前项目中最多只出现少量可接入的电脑端会话候选，并默认折叠。
- 接管候选后，用户进入普通 AgentHub 会话详情页，后续所有手机端能力保持一致。
- 用户不需要理解 Codex/Claude 官方存储、mirror、provider branch 或 archive 能力差异。
- 前台统一使用“移出工作台”，底层 AgentHub archive 与官方候选 ignore/hide 不互相误伤。
- Web authenticated 环境完成真实页面验证。

## Self-Review

- Spec coverage: 覆盖了项目工作台定位、少量会话、项目目录边界、官方候选接管、移出工作台语义、手机端同步、Web 验证。
- Superpowers coverage: 已补充执行前技能闸门；UI 任务绑定 `frontend-design`；bug 排查绑定 `superpowers:systematic-debugging`；完成声明前绑定 `superpowers:verification-before-completion`。
- Placeholder scan: 本计划没有占位步骤或延后实现说明。
- Type consistency: `ProjectScope`、`OfficialProvider`、`OfficialCandidateKey`、`OfficialDiscoveryScope` 在任务间命名一致。
- Risk note: 现有工作区已经有未提交改动，执行本计划时必须先确认哪些文件属于用户已有改动，尤其是 `packages/agenthub-app/sources/sync/sync.ts` 和 `packages/agenthub-app/sources/sync/sessionUpdateGuards.ts`。
