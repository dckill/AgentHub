# 功能与代码映射

本文档是 AgentHub 当前用户能力、实现入口和专题文档之间的索引。它用于回答“功能是否已经实现、代码在哪里、应该同步更新哪份文档”，不替代 API、协议或部署专题。

更新日期：2026-07-24。

## 会话与工作台

| 能力 | 当前行为 | 主要代码入口 | 专题文档 |
| --- | --- | --- | --- |
| Claude Code 会话 | 本地启动、远程接管、权限处理、消息同步和结束状态收口。 | `packages/agenthub-cli/src/claude`、`packages/agenthub-app/sources/-session` | [Agents 与 Provider](./agents-and-providers.md)、[Session Workbench](./architecture/session-workbench.md) |
| Codex 会话 | 使用 Codex app-server，支持动态模型目录、权限模式、官方线程恢复/接管、steer、fork 和消息补抓。 | `packages/agenthub-cli/src/codex` | [Agents 与 Provider](./agents-and-providers.md)、[Session Workbench](./architecture/session-workbench.md) |
| 会话协议 | 新路径使用 `turn-start`、text/tool/file、goal、`turn-end` 等 envelope；旧消息只读兼容。 | `packages/agenthub-cli/src/sessionProtocol`、`packages/agenthub-wire/src`、`packages/agenthub-app/sources/sync/reducer` | [系统架构](./architecture.md)、[agenthub-wire](./agenthub-wire.md) |
| 项目工作台 | 按机器和项目根目录组织 AgentHub 任务及少量官方候选，支持最近会话、高级恢复、归档和永久删除。 | `packages/agenthub-app/sources/app/(app)/index.tsx`、`session/recent.tsx`、`restore` | [Session Workbench](./architecture/session-workbench.md) |
| 会话内工具 | 展示 Markdown、Mermaid、工具调用、Git 状态/diff/log、文件列表和文件内容。 | `packages/agenthub-app/sources/components`、`sources/app/(app)/session` | [App 架构](./app.md) |

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
| 端到端加密 | 服务端保存会话、机器、凭据、Artifacts、KV 和分享密文；密钥材料由客户端管理。 | App/CLI `encryption`、Server storage | [端到端加密](./encryption.md) |
| 实时同步 | REST 快照/V3 消息/V4 cursor 同步与 Socket.IO 增量事件结合，版本号和 seq 做幂等合并。 | Server `api/routes`、`api/socket`，App `sources/sync` | [实时同步与 RPC](./realtime-sync-and-rpc.md)、[HTTP API](./api.md) |
| 离线补偿 | CLI 用私有原子 journal 保存待发送终端消息和待补发的 session-end，重连后确认并清理。 | `packages/agenthub-cli/src/api/terminalOutboxJournal.ts` | [CLI 架构](./cli.md) |
| Artifacts | 加密制品的列表、创建、查看、编辑和删除。 | App `sources/app/(app)/artifacts`、Server `artifactsRoutes.ts` | [Artifacts、Credentials 与 KV](./artifacts-credentials-kv.md) |
| 托管凭据 | App/CLI 管理 Claude Code、Codex 的加密 API key、base URL 和模型覆盖。 | App credentials、CLI `commands/connect.ts`、Server `credentialRoutes.ts` | [Artifacts、Credentials 与 KV](./artifacts-credentials-kv.md) |
| 加密外部分享 | 把选中文本加密为临时链接；服务端仅保存密文，可查看和撤销自己的链接。 | App `-external-share`、Server `externalSharesRoutes.ts` | [加密外部分享](./external-sharing.md) |
| 文件传输 | 在线机器到 App 的分块下载，支持进度、暂停/重试、断线续传、取消和本地记录管理。 | App `fileTransferStore.ts`、CLI `apiMachine.ts`、Server `fileTransferHandler.ts` | [文件传输](./file-transfers.md) |

## 产品与运维

| 能力 | 当前行为 | 主要代码入口 | 专题文档 |
| --- | --- | --- | --- |
| CLI 自更新 | 检查 npm stable、安装最新/指定版本和回滚；开发工作区默认禁用自更新。 | `packages/agenthub-cli/src/update`、`commands/update.ts` | [CLI 架构](./cli.md) |
| 多端 App | Expo Android/iOS/Web 与 Tauri Desktop 共用主要 UI 和同步层。 | `packages/agenthub-app` | [App 架构](./app.md) |
| 自托管 Server | 常规 Postgres/Redis/S3 与 standalone PGlite/本地文件两种形态。 | `packages/agenthub-server` | [部署](./deployment.md)、[Server 架构](./server.md) |
| 安全与资源治理 | 认证吊销、CORS、安全头、请求体限制、账号配额、HTTP/Socket 限流和 Prometheus 指标。 | Server `api/utils`、`monitoring` | [Server 架构](./server.md)、[安全政策](../SECURITY.md) |

## 文档同步规则

新增或修改功能时，至少同步以下位置：

1. 用户入口、命令或页面变化：更新本页和对应 CLI/App 专题。
2. HTTP 路由或 Socket 事件变化：更新 [HTTP API](./api.md) 或 [实时同步与 RPC](./realtime-sync-and-rpc.md)。
3. Provider、权限模式或会话生命周期变化：更新 [Agents 与 Provider](./agents-and-providers.md) 和 Session Workbench。
4. 环境变量、服务或发布入口变化：更新 [部署](./deployment.md) 与 [本地开发环境](./dev-environments.md)。
5. 数据模型、加密域或保留策略变化：更新相关数据专题和隐私/安全文档。
