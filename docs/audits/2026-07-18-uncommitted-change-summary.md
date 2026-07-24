# AgentHub 当前未提交改动详细说明

> 记录日期：2026-07-18
>
> 当前分支：`master`
>
> 对比基线：`b26437e7160a48f7827451c17d79447ae51728b4`
>
> 统计口径：最终发布工作树共有 57 个已跟踪文件被修改、4 个新文件未跟踪，共 61 个未提交路径；新文件包括本文、Evidence 218、Evidence 219 和本机部署/发布报告。
>
> 变更规模：已跟踪文件合计新增 269 行、删除 448 行；新文件不计入 `git diff --stat`。
> 当前状态：尚未暂存、尚未提交。

## 1. 执行摘要

本批改动不是新增一套产品功能，而是对提交 `b26437e7` 完成的全栈强化结果做一次“当前实现事实与仓库说明是否一致”的全局收口。核心目标是消除以下漂移：

1. 产品运行时已经只支持 Claude Code 与 Codex，但 README、商店文案、CLI 指南、开发夹具和部分翻译仍把 Gemini、OpenClaw、OpenCode 或通用 ACP 描述为当前功能。
2. 用户已经明确 CI/GitLab/OIDC/远程 artifact 不属于本地强化目标完成条件，但开发技能和发布元数据守卫仍把 protected integration 写成当前完成门槛。
3. 用户已经取消图形化验证门槛，但开发环境、快速开始、视觉验证手册和若干状态文档仍把浏览器、截图或人工点击描述成默认流程。
4. 当前 App 全量测试因删除一个退出范围 Provider 的重复专用用例，从历史 Evidence 214 的 1453 项变为 1452 项；五份权威文档和状态守卫需要同步刷新。
5. 历史 changelog、审计证据和旧消息兼容必须继续可追溯，不能为了表面一致而改写历史。

收口后的当前事实是：

- 产品运行时只提供 Claude Code 与 Codex 的启动、认证、配置和远程创建入口。
- 旧版本消息中的 legacy `acp` envelope 和旧 provider 标识只用于历史记录的只读解码，不构成可启动 Provider。
- Phase 4 与 Final Verification Gate 的本机目标已完成；真机、跨平台、推送、证书和生产基础设施进入非阻塞人工验收表。
- 远程 CI 仍可以作为实际生产发布运维的一部分，但不再是本地强化目标的完成条件。
- UI 验证默认使用组件、语义/无障碍、状态机、布局边界、协议测试、类型检查和 production build，不再新增浏览器或截图门槛。

## 2. 产品和用户可见范围修正

### 2.1 根 README 与文档入口

修改文件：

- `README.md`
- `docs/README.md`
- `docs/getting-started.md`
- `docs/agents-and-providers.md`
- `docs/cli.md`
- `docs/architecture.md`
- `docs/add-new-machine.md`
- `docs/artifacts-credentials-kv.md`

主要变化：

- 删除 `agenthub gemini`、`agenthub openclaw`、`agenthub acp ...` 和 `agenthub connect gemini` 等已经不存在的当前使用说明。
- 前置依赖改为“Claude Code 或 Codex CLI”，不再要求安装退出范围 Provider。
- CLI、daemon、远程 spawn/resume、托管凭据和系统数据流统一描述为 Claude Code/Codex 双 Provider 模型。
- 明确历史消息仍可只读显示，但不得据此创建、恢复、认证或配置已移除 Provider。
- 根 README 的默认验证命令从 authenticated Web 图形化入口改为 `web:contract:test` 等自动化验证。
- 文档索引不再宣称一次性计划已全部从文档树删除，而是准确说明权威审计、收口矩阵和总计划仍保留在 `docs/audits/` 与 `docs/superpowers/plans/`。

行为影响：用户不会再根据仓库说明调用不存在的命令、安装无用 Provider 或错误理解当前支持矩阵。运行时代码入口本批没有改变，因为双 Provider 限制已经在上一提交完成。

### 2.2 商店元数据

修改文件：`packages/agenthub-app/Stores.md`。

主要变化：

- 关键词删除 `gemini`、`acp`，增加更准确的 `claude code`。
- 完整描述只宣传 Claude Code 与 Codex，不再声称兼容 Gemini、OpenClaw 或任意 ACP CLI。
- 使用步骤明确 `agenthub` 对应 Claude Code、`agenthub codex` 对应 Codex。
- “What's New”从已经失真的“Initial release”改为当前双 Provider、安全、性能、无障碍和多语言改进摘要。

行为影响：避免 App Store/Google Play 审核材料与实际产品能力不一致，也避免用户因不存在的 Provider 能力产生错误购买或安装预期。

## 3. App 客户端资源与历史兼容边界

### 3.1 删除不可达的专用翻译资源

修改文件：

- `packages/agenthub-app/sources/text/_default.ts`
- `packages/agenthub-app/sources/text/translations/ca.ts`
- `packages/agenthub-app/sources/text/translations/en.ts`
- `packages/agenthub-app/sources/text/translations/es.ts`
- `packages/agenthub-app/sources/text/translations/it.ts`
- `packages/agenthub-app/sources/text/translations/ja.ts`
- `packages/agenthub-app/sources/text/translations/pl.ts`
- `packages/agenthub-app/sources/text/translations/pt.ts`
- `packages/agenthub-app/sources/text/translations/ru.ts`
- `packages/agenthub-app/sources/text/translations/zh-Hans.ts`
- `packages/agenthub-app/sources/text/translations/zh-Hant.ts`

每份语言资源统一删除：

- `gemini` 模型速度/能力文案组。
- `agentInput.agent.gemini` 与 `agentInput.agent.openclaw` 标签。
- `agentInput.geminiPermissionMode` 专用权限模式文案组。

这些键在产品 UI 中已不可达，删除后十语言结构仍保持一致，App TypeScript 与翻译 parity 测试均通过。本批没有改变 Amber Crystal 视觉体系、布局或交互组件。

### 3.2 保留历史消息只读能力，但消除“当前 Provider”暗示

修改文件：

- `packages/agenthub-app/sources/sync/typesRaw.ts`
- `packages/agenthub-app/sources/components/tools/knownTools.tsx`

主要变化：

- `typesRaw.ts` 中 legacy `type: 'acp'` schema 保持不变，只把注释从“所有 Provider 的统一格式”校正为“历史记录的只读 envelope”。
- normalization 注释明确当前会话使用 `sessionProtocol`，legacy 分支只负责旧记录投影。
- `knownTools.tsx` 的兼容字段和旧工具别名继续存在，以保证历史消息仍可展示；注释改为 provider-neutral 的“historical/legacy payload”，不再把它描述为当前 Gemini 实现。

行为影响：历史会话不会丢失可读性；同时不会因为代码注释或专用文案误导维护者恢复退出范围 Provider。

## 4. 测试与夹具范围收口

### 4.1 App 测试

修改文件：

- `packages/agenthub-app/sources/components/modelModeOptions.test.ts`
- `packages/agenthub-app/sources/sync/agentTypes.test.ts`
- `packages/agenthub-app/sources/sync/typesRaw.spec.ts`

主要变化：

- unsupported provider 回退测试改用中性的 `legacy-provider`，继续验证未知 metadata 不会创建额外模型或权限模式。
- `agentTypes` 测试继续验证只有 Claude/Codex 被识别为受支持 Provider，但不再维护 Gemini/OpenClaw 专用测试名称。
- 删除一项把 Gemini 数据伪装成 Codex schema 的重复测试；Codex 原生 schema 和 legacy-record 兼容测试仍完整保留。

结果：App 全量测试从 Evidence 214 的 1453 项变为当前 1452 项。减少的是退出范围 Provider 的重复专用用例，不是跳过、屏蔽或放宽测试。

### 4.2 CLI 测试与说明

修改文件：

- `packages/agenthub-cli/agents.md`
- `packages/agenthub-cli/src/resume/handleResumeCommand.test.ts`
- `packages/agenthub-cli/src/utils/detectLocalCredentials.test.ts`

主要变化：

- CLI Agent 测试说明只列 Claude 与 Codex 两个主 integration 文件，删除已经不存在的 Gemini/OpenClaw 路径。
- 不支持 flavor 的 resume 负测改用 `legacy-provider`，仍验证 CLI 会明确拒绝非 Claude/Codex 会话。
- credential 检测测试不再清理 Gemini/OpenClaw 专用环境变量，因为生产检测逻辑已不读取这些变量。

### 4.3 开发测试夹具

修改文件：

- `environments/lab-rat-todo-project/README.md`
- `environments/lab-rat-todo-project/agents.md`

主要变化：测试夹具的适用对象从 OpenCode/任意 Agent 改为通过 AgentHub 运行的 Claude Code 与 Codex，避免新维护者把它当作通用 ACP Provider 验收环境。

## 5. 防止状态再次漂移的自动化守卫

### 5.1 产品范围守卫

修改文件：`scripts/productProviderScope.test.cjs`。

新增两组失败关闭检查：

1. README、当前文档、CLI 测试说明和商店元数据不得重新出现退出范围 Provider 的启动、安装、连接或支持声明。
2. 默认语言和十份翻译不得重新引入 Gemini 专用模型/权限 UI 键。

TDD 结果：首次运行 3 passed / 2 failed，证明旧文档和翻译会被捕获；修正后 5 passed / 0 failed。

### 5.2 当前状态数字守卫

修改文件：

- `scripts/currentDocumentationStatus.cjs`
- `scripts/currentDocumentationStatus.test.cjs`

主要变化：

- 当前 App 标记从 1453 刷新为 1452。
- 五份权威文档必须共同引用 Evidence 218，而不是继续把 Evidence 214 当成当前状态。
- 1453 与既有 1444/1451 一起进入“不得冒充当前 App 数量”的历史值集合。
- 错误码从 `missing-evidence-214` 更新为 `missing-evidence-218`。

行为影响：以后如果某份权威状态文档回退到旧测试计数、遗漏最新证据或重新出现未完成计划项，`documentation:status` 会失败关闭。

### 5.3 发布元数据与 CI 范围守卫

修改文件：

- `scripts/releaseMetadata.ts`
- `scripts/releaseMetadata.test.ts`

原问题：旧守卫要求 dev skill 必须包含“Protected integration jobs remain required release gates”，与用户最新范围决策直接冲突。

新规则：

- dev skill 必须保留三个正确 bundle ID。
- dev skill 必须明确远程 GitLab/CI 不属于本地强化完成条件。
- release skill 仍独立校验真实生产发布使用 GitLab/master、自托管文档、immutable digest 和现有发布治理。
- 继续拒绝 TeamCity、GitHub releases/pages、旧 bundle ID、`main` 等历史漂移。

TDD 结果：旧守卫首次出现 7 passed / 1 failed；修正后 8 passed / 0 failed，`metadata:check` 返回 `issues=[]`。

## 6. 开发、维护与发布操作说明

修改文件：

- `.agents/skills/dev/SKILL.md`
- `.agents/skills/maintain/SKILL.md`
- `.agents/skills/release/SKILL.md`
- `docs/dev-environments.md`
- `docs/upstream-integration-and-brand-roadmap.md`
- `docs/web-visual-validation-playbook.md`

主要变化：

- dev skill 明确本地 hardening 独立于远程 CI；缺少外部凭据/平台时进入人工验收，而不是以 skip 冒充通过。
- authenticated Web 仅作为需要真实登录态时的隔离环境，不再是默认截图入口。
- 必需 UI 验证改为 `web:contract:test`、组件/状态/无障碍测试、typecheck 和 production build。
- release skill 增加范围说明：其中 protected GitLab/OIDC/artifact 内容属于生产发布操作，不得扩张成本地强化目标。
- maintain skill 的里程碑示例从 OpenCode/Copilot/Cursor/ACP 改为 Claude Code/Codex 的 provider reliability。
- Web 视觉验证手册保留原内容，但在顶部明确标记为历史归档，只用于解释旧截图证据。
- 上游品牌路线文档把 UI 验收要求从截图改为自动化语义、状态、布局和构建证据。

## 7. 权威状态与历史证据分层

修改文件：

- `docs/project-status.md`
- `docs/validation-coverage.md`
- `docs/verification-matrix.md`
- `docs/audits/2026-07-11-hardening-verification-matrix.md`
- `docs/superpowers/plans/2026-07-11-agenthub-hardening-and-optimization.md`
- `docs/app.md`

主要变化：

- 当前阶段统一为“Phase 4 与 Final Verification Gate 本机完成，非阻塞人工验收开放”。
- 当前 App 自动化刷新为 251 files / 1452 tests / 0 failed / 0 skipped。
- 当前 Provider 统一为 Claude Code/Codex；退出范围 Provider 的旧矩阵不再计覆盖率或发布阻断。
- CI/GitLab/OIDC/远程 artifact 行明确标为历史或目标外，不再覆盖当前完成结论。
- 旧 Web 截图、Evidence 175–210 和旧 Phase 3/4 中间状态继续原样保留，但增加“历史证据索引/历史 Evidence 日志”边界，防止旧记录被误读为当前待办。
- 当前 coverage 数值继续引用 Evidence 208 的最近完整 coverage 观测；Evidence 176 继续只作为非下降阈值，未伪造新的 coverage 结果。
- 总计划说明 `.gitlab-ci.yml` 只维持已有发布配置的最低一致性，不再继续扩建。

## 8. 新增验证证据

新增文件：

- `docs/audits/evidence/2026-07-18-phase4/218-current-implementation-documentation-and-provider-scope-reconciliation.json`

Evidence 218 记录：

- 两轮真实 RED：产品范围守卫 3/5、发布元数据 7/8。
- 修复后的产品范围 5/5、文档状态 3/3、metadata 8/8。
- App 定向 78/78、CLI 定向 9/9、App 全量 251 files / 1452 tests。
- 根 `check` 最终顺序运行 exit 0。
- 86 份 Markdown 本地链接 0 断链。
- 未执行浏览器、截图、模拟器或人工点击。
- systemd daemon、runner PID、8443 连接和 `KillMode=process` 不变量。

## 9. 验证结果汇总

| 验证项 | 结果 |
|---|---|
| 产品范围 TDD RED | 3 passed / 2 failed，正确捕获旧文档和专用翻译 |
| 产品范围守卫 GREEN | 5 passed / 0 failed |
| 文档状态测试 | 3 passed / 0 failed |
| 文档状态扫描 | `ok=true`，`issues=[]` |
| 发布元数据测试 | 8 passed / 0 failed |
| 发布元数据扫描 | `ok=true`，`issues=[]` |
| App 定向测试 | 4 files / 78 passed |
| CLI 定向测试 | 2 files / 9 passed |
| App 全量 | 251 files / 1452 passed / 0 failed / 0 skipped |
| App typecheck | exit 0 |
| 根 `check` | exit 0；所有 workspace typecheck、Server 5/5、Wire 2/2 |
| Markdown 本地链接 | 86 files / 0 broken |
| `git diff --check` | exit 0 |
| 图形化验证 | 未执行，符合当前目标 |

验证过程中曾把根 `check` 与 CLI build 并行运行，Codium 在 CLI `dist` 替换窗口内短暂报找不到 `@artsum/agenthub/claude-sdk`，首次根检查 exit 2。CLI build 完成后顺序重跑同一根检查 exit 0，因此这是验证编排竞态，不是源码回归。后续不应并行运行会重建共享 `packages/agenthub-cli/dist` 的命令与依赖该目录的 workspace typecheck。

## 10. 兼容性、安全与风险判断

### 保持不变的关键边界

- 未改变 E2EE、root secret 内存策略、账号 teardown、分享 capability、Server 数据模型或网络协议。
- 未改变 daemon/runner 生命周期、systemd `KillMode=process`、active turn 收尾或 archive 行为。
- 未删除历史消息解码所需的 legacy schema 和工具展示兼容。
- 未改写历史 changelog、旧审计数字或历史截图本身。
- 未新增或扩建 CI、GitLab runner、OIDC 或远程 artifact 功能。
- 未进行 UI 视觉重设计，也未改变 Amber Crystal 产品哲学。

### 当前剩余风险

- GitNexus 本轮刷新失败，`query`、`impact` 和 `detect_changes` 均返回 `transport closed`。本批除元数据守卫外没有修改运行时函数/类/方法；相关影响通过源码直接调用关系、类型检查、定向测试和 App 全量回归替代复核。
- Native 真机、macOS/Windows、APNs/FCM、Universal/App Links 与真实生产基础设施仍只能在对应外部环境验收，统一记录于 `docs/audits/2026-07-18-manual-acceptance-checklist.md`。
- 当前未重新运行 coverage，因此 coverage 数值继续使用最近一次 Evidence 208 的真实观测；不能把 1452 项普通全量测试误写成新的 coverage/JUnit 结果。

## 11. 建议的审查顺序

1. 先审查 `scripts/productProviderScope.test.cjs`、`scripts/currentDocumentationStatus.cjs` 和 `scripts/releaseMetadata.ts`，确认三类失败关闭规则符合当前产品决策。
2. 再审查 `README.md`、`docs/getting-started.md`、`docs/agents-and-providers.md`、`docs/cli.md` 和 `packages/agenthub-app/Stores.md`，确认用户可见能力只剩 Claude Code/Codex。
3. 审查默认与十语言翻译的机械删除，确认每份文件删除相同的 20 行专用键。
4. 审查 `typesRaw.ts` 与 `knownTools.tsx`，确认只改兼容语义说明，没有删除历史解码逻辑。
5. 最后审查状态文档和 Evidence 218，确认当前数字、历史数字、目标外项目和人工验收项没有混用。

## 12. 未提交文件清单

### 操作技能与根入口

- `.agents/skills/dev/SKILL.md`
- `.agents/skills/maintain/SKILL.md`
- `.agents/skills/release/SKILL.md`
- `README.md`

### 工程与产品文档

- `docs/README.md`
- `docs/add-new-machine.md`
- `docs/agents-and-providers.md`
- `docs/app.md`
- `docs/architecture.md`
- `docs/artifacts-credentials-kv.md`
- `docs/cli.md`
- `docs/dev-environments.md`
- `docs/getting-started.md`
- `docs/project-status.md`
- `docs/upstream-integration-and-brand-roadmap.md`
- `docs/validation-coverage.md`
- `docs/verification-matrix.md`
- `docs/web-visual-validation-playbook.md`
- `docs/audits/2026-07-11-hardening-verification-matrix.md`
- `docs/superpowers/plans/2026-07-11-agenthub-hardening-and-optimization.md`

### 新增审计材料

- `docs/audits/evidence/2026-07-18-phase4/218-current-implementation-documentation-and-provider-scope-reconciliation.json`
- `docs/audits/2026-07-18-uncommitted-change-summary.md`

### 开发夹具

- `environments/lab-rat-todo-project/README.md`
- `environments/lab-rat-todo-project/agents.md`

### App 商店、兼容层、测试与翻译

- `packages/agenthub-app/Stores.md`
- `packages/agenthub-app/sources/components/modelModeOptions.test.ts`
- `packages/agenthub-app/sources/components/tools/knownTools.tsx`
- `packages/agenthub-app/sources/sync/agentTypes.test.ts`
- `packages/agenthub-app/sources/sync/typesRaw.spec.ts`
- `packages/agenthub-app/sources/sync/typesRaw.ts`
- `packages/agenthub-app/sources/text/_default.ts`
- `packages/agenthub-app/sources/text/translations/ca.ts`
- `packages/agenthub-app/sources/text/translations/en.ts`
- `packages/agenthub-app/sources/text/translations/es.ts`
- `packages/agenthub-app/sources/text/translations/it.ts`
- `packages/agenthub-app/sources/text/translations/ja.ts`
- `packages/agenthub-app/sources/text/translations/pl.ts`
- `packages/agenthub-app/sources/text/translations/pt.ts`
- `packages/agenthub-app/sources/text/translations/ru.ts`
- `packages/agenthub-app/sources/text/translations/zh-Hans.ts`
- `packages/agenthub-app/sources/text/translations/zh-Hant.ts`

### CLI

- `packages/agenthub-cli/agents.md`
- `packages/agenthub-cli/src/resume/handleResumeCommand.test.ts`
- `packages/agenthub-cli/src/utils/detectLocalCredentials.test.ts`

### 自动化守卫

- `scripts/currentDocumentationStatus.cjs`
- `scripts/currentDocumentationStatus.test.cjs`
- `scripts/productProviderScope.test.cjs`
- `scripts/releaseMetadata.ts`
- `scripts/releaseMetadata.test.ts`

## 13. 建议提交说明

建议作为一个“产品范围与文档事实收口”提交，因为代码资源删除、文档修正和失败关闭守卫共同构成同一原子意图：

```text
docs: 收口双 Provider 产品范围与当前验证事实

- 统一 README、商店、CLI 和工程文档为 Claude Code/Codex 双 Provider
- 删除退出范围 Provider 的不可达十语言文案和重复专用测试
- 保留旧消息只读兼容并明确历史证据边界
- 将远程 CI 与图形化验证移出本地强化完成条件
- 新增产品范围、文档状态和发布元数据失败关闭守卫
- 刷新 Evidence 218 与 App 251 files/1452 tests 当前基线
```

## 14. 2026-07-18 本机部署与正式交付增量

在原有“当前实现事实收口”基础上，本轮又完成了可发布交付：

- `packages/agenthub-cli/package.json` 从 1.0.3 提升到 1.0.4，`docs/project-status.md` 与 `docs/add-new-machine.md` 同步版本事实。
- CLI production bundle、类型检查和单元测试通过，结果为 107 files / 709 tests；release metadata 8/8。
- `@artsum/agenthub@1.0.4` 已发布到 npm，`latest` 已切换到 1.0.4；本机全局 CLI 已由同一验证 tarball 安装为 1.0.4。
- `DEPLOY_AND_DEV.md` 与本机 `agenthub-server.service` 修正 isolated 依赖路径；Server 补执行 5 个迁移并完成三用途密钥切换，本地/公网健康检查均为 200。
- 新增 App Version 19 中英文 changelog并刷新三份内置 JSON；版本漂移测试先失败 3 项，更新断言后 7/7 通过。
- Android 在 changelog 更新后重新构建，最终推荐包为 `artifacts/agenthub-production-arm64-20260718-2227.apk`，57,909,638 bytes，签名 v2、ZIP、arm64 ABI 与包元数据验证通过。
- 新增 `docs/audits/2026-07-18-local-deployment-cli-1.0.4-android-release.md` 和 Evidence 219，并同步四份权威状态/计划/矩阵文档。
- GitNexus 重新索引为 16,209 nodes / 37,706 edges / 300 flows，变更检测为 low risk、0 affected processes；`AGENTS.md` 的索引统计随之刷新。

daemon 的代码与 bundle 已更新到 1.0.4，但服务端安全切换按设计废止旧 Token；当前需要用户用已重新登录的 App 执行一次 `agenthub auth login --force`。这项人工认证与最终 runner/8443 连接复核已写入非阻塞验收表，没有通过放宽 Token 校验来绕过。

新增或额外修改的发布路径包括：

- `AGENTS.md`
- `DEPLOY_AND_DEV.md`
- `packages/agenthub-cli/package.json`
- `packages/agenthub-app/CHANGELOG.md`
- `packages/agenthub-app/CHANGELOG.en.md`
- `packages/agenthub-app/sources/changelog/changelog.json`
- `packages/agenthub-app/sources/changelog/changelog.en.json`
- `packages/agenthub-app/sources/changelog/changelog.zh-Hans.json`
- `packages/agenthub-app/sources/changelog/changelogLocalization.test.ts`
- `docs/audits/2026-07-18-local-deployment-cli-1.0.4-android-release.md`
- `docs/audits/evidence/2026-07-18-release/219-local-server-cli-1.0.4-npm-and-android-delivery.json`
