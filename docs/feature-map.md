# 功能与代码映射

本文档是 AgentHub 当前用户能力、实现入口和专题文档之间的索引。它用于回答“功能是否已经实现、代码在哪里、应该同步更新哪份文档”，不替代 API、协议或部署专题。

更新日期：2026-08-04。

## 会话与工作台

| 能力 | 当前行为 | 主要代码入口 | 专题文档 |
| --- | --- | --- | --- |
| Claude Code 会话 | 本地启动、远程接管、权限处理、消息同步和结束状态收口。 | `packages/agenthub-cli/src/claude`、`packages/agenthub-app/sources/-session` | [Agents 与 Provider](./agents-and-providers.md)、[Session Workbench](./architecture/session-workbench.md) |
| Codex 会话 | 使用 Codex app-server，支持动态模型目录（分页游标、稳定去重）、权限模式、审批决策 legacy/v2/MCP 映射、官方线程恢复/接管、steer、fork 和消息补抓；thread start/resume/fork 参数由共享 builder 统一 defaults/opts 边界。 | `packages/agenthub-cli/src/codex` | [Agents 与 Provider](./agents-and-providers.md)、[Session Workbench](./architecture/session-workbench.md) |
| 会话协议 | 新路径使用 `turn-start`、text/tool/file、goal、`turn-end` 等 envelope；旧消息只读兼容。 | `packages/agenthub-cli/src/sessionProtocol`、`packages/agenthub-wire/src`、`packages/agenthub-app/sources/sync/reducer` | [系统架构](./architecture.md)、[agenthub-wire](./agenthub-wire.md) |
| 项目工作台 | 按机器和项目根目录组织 AgentHub 任务及少量官方候选，支持最近会话、高级恢复、归档和永久删除。 | `packages/agenthub-app/sources/app/(app)/index.tsx`、`session/recent.tsx`、`restore` | [Session Workbench](./architecture/session-workbench.md) |
| 会话内工具 | 展示 Markdown、Mermaid、工具调用、Git 状态/diff/log、文件列表和文件内容。 | `packages/agenthub-app/sources/components`、`sources/app/(app)/session` | [App 架构](./app.md) |
| 会话分叉 | Claude/Codex 均支持安全 fork 和消息级 duplicate，保留父子会话关系并隔离分叉后的历史；不开放破坏性 rewind。 | CLI `claude` / `codex` fork，App `sessionFork.ts`、消息操作 | [Session Workbench](./architecture/session-workbench.md) |
| 会话状态与限额 | 状态栏统一展示运行状态、真实上下文窗口、使用量和 Claude 限额；缺失、过期或不支持的数据安全降级。 | App `SessionStatusBar`、CLI usage/model metadata | [App 架构](./app.md)、[Agents 与 Provider](./agents-and-providers.md) |
| 会话 Active Device | 每个会话单一控制设备；其他设备只读观察，可显式接管/释放；控制权事件、写入拦截、设备身份、断线 grace cleanup 和 `turnOriginDevice` 已贯通。 | Wire `sessionControl`、Server `sessionControl.ts`/Socket handlers、App `sessionControlStore`/`SessionStatusBar` | [实时同步与 RPC](./realtime-sync-and-rpc.md) |
| 面板、快捷键与 Side Chat | changes/all files/side chat 面板可持久化；快捷键集中注册且可发现；Side Chat 复用会话父子协议并贯通创建、关闭和 runner 收口。 | App `panels`、`shortcuts`、`sideChat`，Wire/CLI daemon session metadata | [Session Workbench](./architecture/session-workbench.md) |

## 机器与远程控制

| 能力 | 当前行为 | 主要代码入口 | 专题文档 |
| --- | --- | --- | --- |
| 跨平台 daemon | Linux systemd user service、macOS LaunchAgent、Windows 登录计划任务。 | `packages/agenthub-cli/src/daemon` | [Daemon 与机器](./daemon-and-machines.md) |
| 登录后自动接入 | 登录后检查/安装自启动服务、启动当前版本 daemon；Linux 尝试配置 linger，失败时给出人工命令。 | `packages/agenthub-cli/src/daemon/postLoginSetup.ts` | [快速开始](./getting-started.md)、[Daemon 与机器](./daemon-and-machines.md) |
| 远程创建与恢复 | App 或 `agenthub-agent` 通过 machine-scoped RPC 调用 daemon 的 spawn、resume、stop。 | `packages/agenthub-cli/src/daemon/run.ts`、`packages/agenthub-server/sources/app/api/socket/rpcHandler.ts` | [实时同步与 RPC](./realtime-sync-and-rpc.md) |
| 机器文件浏览 | 在线机器可浏览目录树和文件，并从机器向 App 下载文件。 | `packages/agenthub-app/sources/app/(app)/machine/[id]/files.tsx`、CLI RPC handlers | [文件传输](./file-transfers.md) |
| 独立远程控制 CLI | 登录、列机器/会话、spawn、send、history、wait、stop。 | `packages/agenthub-agent/src` | [agenthub-agent](./agenthub-agent.md) |

## 数据与协作

| 能力 | 当前行为 | 主要代码入口 | 专题文档 |
| --- | --- | --- | --- |
| 端到端加密 | 服务端保存会话、机器、凭据、Artifacts、KV 和分享密文；密钥材料由客户端管理；Wire version-0 bundle、CLI/Agent AES-GCM 与 App native AES wrapper 已有跨包双向 parity 门禁，原生真机与算法统一仍单列高风险批次。 | App/CLI/Agent `encryption`、Wire `cryptoContract`、Server storage | [端到端加密](./encryption.md) |
| 实时同步 | REST 快照/V3 消息/V4 cursor 同步与 Socket.IO 增量事件结合，版本号和 seq 做幂等合并；App `handleUpdate` 已将 session 副作用、delete-session/delete-machine/delete-artifact 清理、ephemeral 分发、activity flush、message catch-up、latest page、older page、fetchMessages 请求/锁失败恢复、older-page 请求/锁失败恢复、new-session 加载恢复、new-message 投递、new-artifact/update-artifact/new-machine/update-machine/update-account/update-session 应用和消息分页模式/停滞保护抽成可测试边界，历史页成功后会清除旧 retry backoff。 | Server `api/routes`、`api/socket`，App `sources/sync` | [实时同步与 RPC](./realtime-sync-and-rpc.md)、[HTTP API](./api.md) |
| 离线补偿 | CLI 用私有原子 journal 保存待发送终端消息和待补发的 session-end，重连后确认并清理。 | `packages/agenthub-cli/src/api/terminalOutboxJournal.ts` | [CLI 架构](./cli.md) |
| Artifacts | 加密制品的列表、创建、查看、编辑和删除。 | App `sources/app/(app)/artifacts`、Server `artifactsRoutes.ts` | [Artifacts、Credentials 与 KV](./artifacts-credentials-kv.md) |
| 托管凭据 | App/CLI 管理 Claude Code、Codex 的加密 API key、base URL 和模型覆盖。 | App credentials、CLI `commands/connect.ts`、Server `credentialRoutes.ts` | [Artifacts、Credentials 与 KV](./artifacts-credentials-kv.md) |
| 加密外部分享 | 把选中文本加密为临时链接；服务端仅保存密文，可查看和撤销自己的链接。 | App `-external-share`、Server `externalSharesRoutes.ts` | [加密外部分享](./external-sharing.md) |
| 文件传输 | 在线机器到 App 的分块下载，支持进度、暂停/重试、断线续传、取消和本地记录管理。 | App `fileTransferStore.ts`、CLI `apiMachine.ts`、Server `fileTransferHandler.ts` | [文件传输](./file-transfers.md) |
| 会话 E2EE 附件 | Claude/Codex 消息附件覆盖选择、大小校验、客户端加密、上传引用、同步、下载解密、预览和失败恢复。 | App `attachments`、CLI message converters、Server attachment routes、Wire schemas | [端到端加密](./encryption.md) |
| 子智能体活动 | Claude/Codex runner 把子智能体活动和终态送入共享协议，App 实时投影；中止和异常退出同步关闭活动状态。 | CLI runner/session protocol、Wire envelopes、App sync reducer/components | [实时同步与 RPC](./realtime-sync-and-rpc.md) |
| Smart Push 目标过滤 | Push Token 绑定 deviceId；带 sessionId 的通知请求排除当前 active device，旧 token 保持兼容。 | Server `pushRoutes.ts`、App `apiPush.ts`、CLI `pushNotifications.ts` | [实时同步与 RPC](./realtime-sync-and-rpc.md) |

## 产品与运维

| 能力 | 当前行为 | 主要代码入口 | 专题文档 |
| --- | --- | --- | --- |
| CLI 自更新 | 检查 npm stable、安装最新/指定版本和回滚；开发工作区默认禁用自更新。 | `packages/agenthub-cli/src/update`、`commands/update.ts` | [CLI 架构](./cli.md) |
| 多端 App | Expo Android/iOS/Web 与 Tauri Desktop 共用主要 UI 和同步层。 | `packages/agenthub-app` | [App 架构](./app.md) |
| 移动端 Liquid Glass | Amber Crystal 的跨平台材质层：受支持 iOS 使用原生 glass、旧 iOS 使用 blur、Android 使用低成本确定性模拟；正文保持不透明并尊重减少动态设置。 | App `MobileGlass.tsx`、`mobileGlassPolicy.ts`、移动导航与输入容器 | [App 架构](./app.md) |
| 自托管 Server | 常规 Postgres/Redis/S3 与 standalone PGlite/本地文件两种形态。 | `packages/agenthub-server` | [部署](./deployment.md)、[Server 架构](./server.md) |
| 安全与资源治理 | 认证吊销、CORS、安全头、请求体限制、账号配额、HTTP/Socket 限流和 Prometheus 指标。 | Server `api/utils`、`monitoring` | [Server 架构](./server.md)、[安全政策](../SECURITY.md) |

## 文档同步规则

新增或修改功能时，至少同步以下位置：

1. 用户入口、命令或页面变化：更新本页和对应 CLI/App 专题。
2. HTTP 路由或 Socket 事件变化：更新 [HTTP API](./api.md) 或 [实时同步与 RPC](./realtime-sync-and-rpc.md)。
3. Provider、权限模式或会话生命周期变化：更新 [Agents 与 Provider](./agents-and-providers.md) 和 Session Workbench。
4. 环境变量、服务或发布入口变化：更新 [部署](./deployment.md) 与 [本地开发环境](./dev-environments.md)。
5. 数据模型、加密域或保留策略变化：更新相关数据专题和隐私/安全文档。
