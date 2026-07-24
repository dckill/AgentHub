# AGENTS.md

<INSTRUCTIONS>
- 永远使用中文回答。
- 全仓库、所有任务和后续迭代均禁止调用或使用 `superpowers:using-superpowers`；不得把它写成对话、计划、开发、排查、验证或技能发现的入口/前置条件。历史文档若提及该名称，只能用于说明“已禁用”，不得形成执行要求。
- 开始较复杂的开发、排查、调研、计划或重构前，按当前任务直接选择并读取具体适用的 skills；不要因为“只要有 1% 可能适用”就调用通用入口技能，也不要把技能检查变成每次响应前的固定流程。涉及计划、执行、调试或验证时，可按需直接使用 `superpowers:writing-plans`、`superpowers:systematic-debugging`、`superpowers:executing-plans`、`superpowers:verification-before-completion` 等具体技能，不要凭记忆代替其当前说明。
- 涉及 UI / 前端 / 视觉 / 交互 / 布局 / 页面状态改造时，必须先读取并使用 `frontend-design` skill，再进行实现或评审；即使是偏工具型界面，也要先明确用户场景、信息密度、视觉层级和交互状态。
- 后续开发采用集中批次 TDD：先锁定必要的失败测试，再集中完成实现，运行定向测试、类型检查和必要构建；每个阶段结束后统一执行该阶段完整自动化回归，避免为每个小改动重复全量测试。
- 当前产品运行时只支持 Claude Code 与 Codex。不得新增或恢复 Gemini、OpenClaw、OpenCode 或通用 ACP Provider 的启动、认证、配置、专用 UI、依赖与测试；历史消息仅可保留无创建入口的通用只读兼容。
- CI、GitLab protected runner、OIDC 和远程 artifact 不属于当前强化目标的完成条件；源码变化只维持既有配置的最低一致性，不继续扩建 CI。无法在本机执行的真机、跨平台或生产环境验证写入人工验收表，不得阻塞本地功能完成。
- 不再新增浏览器、截图、录屏、人工点击或其他图形化验证步骤，也不再把真实页面截图作为完成门槛。UI / 视觉 / 交互改动通过组件测试、语义/无障碍断言、状态机测试、布局边界测试、E2E 协议测试和 production build 自动化验证；已有历史图形证据保留但不重复执行。
- 只有用户之后明确要求人工视觉验收或平台商店强制需要截图时，才临时恢复对应图形化步骤；若启动浏览器或模拟器，结束后仍必须清理相关残留进程。
- Android 本机打包产物必须统一放到仓库根目录 `artifacts/`。
- 个人正式包默认命名为 `agenthub-production-arm64-YYYYMMDD-HHMM.apk`，并同时刷新 `agenthub-production-arm64-latest.apk`。
- 后续打 Android APK 优先使用 `npx -y pnpm@10.11.0 --filter agenthub-app android:apk:arm64` 或 `scripts/build-android.sh`，不要只把 Gradle 内部输出目录当成交付产物。
- 修改 AgentHub daemon、runner、CLI 更新流程时，必须同时考虑：Linux `agenthub-daemon.service` 需要 `KillMode=process`；systemd 托管 daemon 的 bundle 替换应交给 `Restart=on-failure` 重启；agent runner 在 SIGTERM/SIGINT/归档/异常退出时必须补齐 active turn 的 `turn-end` 并关闭 thinking，避免 App 会话卡在“思考中”。
- 本机/服务器标准启动方案：服务端用 `agenthub-server.service` 管理；本机 daemon 用 `agenthub-daemon.service` 管理。更新 CLI 前优先停止 systemd daemon，构建后重启并检查 `systemctl --user status agenthub-daemon.service --no-pager`、`agenthub daemon status`、`agenthub daemon list`。不要让 systemd inactive 但手动 daemon 长期运行。
- 智能体执行 daemon/runner 重启或清理时，必须先记录 `agenthub daemon list` 和相关 `ps` 进程；失联 Codex runner（如 app-server SIGKILL、`stdin not writable`）必须归档退出，不得继续作为活跃会话显示。清理后必须确认只剩一个 systemd 托管 daemon，`agenthub daemon list` 与实际 runner 进程一致；会话列表只应兜底显示官方未归档 Codex/Claude 会话。
- 频繁开发 agenthub-cli / daemon / runner 时，必须把“进程治理”当作交付标准的一部分：
  - 改动或 build 前，先记录 `agenthub daemon status && agenthub daemon list`，并记录 `ps -eo pid,ppid,stat,etime,rss,cmd | rg 'agenthub|codex --agenthub|codex app-server --listen stdio|daemon start-sync'`。
  - CLI build 会替换 `dist/index.mjs`，systemd daemon 可能按 bundle mtime 自重启；构建后必须复查 `systemctl --user status agenthub-daemon.service --no-pager`、`agenthub daemon status`、`agenthub daemon list`、`ss -ntp | rg '(:8443|agenthub|codex)'`。
  - 正常目标状态：只有一个 `agenthub-daemon.service` 主进程；`agenthub daemon list` 中的 runner PID 与 `ps` 中 daemon-spawned runner 一一对应；每个活跃 runner 如需接收 App RPC，必须有到 `agenthub.yzsd.asia:8443` 的 `ESTAB` websocket；不在线 runner 不得继续作为活跃会话保留。
  - 发现逃逸 runner（进程存在但 daemon list 不认识、无 8443 连接、或资源管理器 RPC 一直 `not available`）时，优先通过新版 daemon 的收养能力恢复管理，然后用 `agenthub daemon stop-session <sessionId>` 让 runner 自己走 SIGTERM/归档/flush；只有 stop-session 不可用时，才在记录现场后对对应 PID 发 SIGTERM。
  - 禁止用 `kill -9` 作为常规清理手段；只有 SIGTERM 后确认 runner 卡死且已记录日志/进程/连接状态时才可升级到 SIGKILL。SIGKILL 后必须检查并修复 App 会话状态，避免留下“思考中”或假活跃。
  - 不要在 systemd daemon 之外长期运行手动 `agenthub daemon start-sync`；临时调试 daemon 必须使用独立 `AGENTHUB_HOME_DIR` 或在结束时明确停止并清理 state 文件。
</INSTRUCTIONS>

<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **Happy-AgentRemote** (16473 symbols, 38467 relationships, 300 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> Index stale? Run `node .gitnexus/run.cjs analyze` from the project root — it auto-selects an available runner. No `.gitnexus/run.cjs` yet? `npx gitnexus analyze` (npm 11 crash → `npm i -g gitnexus`; #1939).

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows. For regression review, compare against the default branch: `detect_changes({scope: "compare", base_ref: "master"})`.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `rename` which understands the call graph.
- NEVER commit changes without running `detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/Happy-AgentRemote/context` | Codebase overview, check index freshness |
| `gitnexus://repo/Happy-AgentRemote/clusters` | All functional areas |
| `gitnexus://repo/Happy-AgentRemote/processes` | All execution flows |
| `gitnexus://repo/Happy-AgentRemote/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->
