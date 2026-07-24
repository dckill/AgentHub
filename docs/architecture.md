# 系统架构

AgentHub 当前是一个 pnpm monorepo，核心目标是把本机 AI 编码代理暴露给移动端、Web 端和远程终端，同时保持会话内容端到端加密。

## 包结构

| 路径 | 作用 |
| --- | --- |
| `packages/agenthub-cli` | `agenthub` CLI，负责启动 Claude Code/Codex、运行 daemon、同步会话。 |
| `packages/agenthub-app` | Expo 应用，覆盖 iOS、Android、Web，并包含 Tauri 桌面构建配置。 |
| `packages/agenthub-server` | Fastify + Socket.IO 后端，提供认证、同步、RPC、存储和监控。 |
| `packages/agenthub-wire` | 客户端与服务端共享的 Zod schema 和 TypeScript 类型。 |
| `packages/agenthub-agent` | 独立远程控制 CLI，用于列机器、创建/发送/等待/停止会话。 |
| `packages/agenthub-app-logs` | 开发调试用日志聚合服务。 |
| `packages/codium` | Electron 桌面实验包，独立于主要 App。 |

## 主数据流

```text
手机/Web/Tauri App
  ├─ 本地保存账号主密钥和 UI 状态
  ├─ 通过 HTTPS 调用 REST API 拉取快照
  └─ 通过 Socket.IO 接收实时更新、发消息、做 RPC
        │
        ▼
AgentHub Server
  ├─ 验证 privacy-kit token
  ├─ 保存加密后的会话、机器、凭据、制品和 KV
  ├─ 用 Socket.IO 按账号/会话/机器转发事件
  └─ 可选 Redis Streams 支持多副本广播
        │
        ▼
本机 agenthub daemon / CLI
  ├─ 注册机器与机器在线状态
  ├─ 启动 Claude Code 或 Codex 进程
  ├─ 将代理消息加密后上传
  └─ 执行来自 App 或 agenthub-agent 的 RPC 请求
```

### 全景架构图

[![AgentHub 全景架构图](./assets/diagrams/agenthub-full-architecture.webp)](./assets/diagrams/agenthub-full-architecture.webp)

图中主链路只覆盖当前生产范围：AgentHub 客户端、Server、本机
CLI/daemon、每会话 runner，以及 Claude Code/Codex。机器文件传输方向为
`machine → App`，不是通用双向文件同步。

## 信任边界

- 服务端负责认证、路由、排序、持久化和广播，但不应看到明文会话内容。
- 账号、机器、会话、制品和托管凭据有不同的加密域；详见 [端到端加密](./encryption.md)。
- Socket.IO 事件可按 `user-scoped`、`session-scoped`、`machine-scoped` 三种连接类型过滤，减少无关广播。
- 生产会话消息的加密内容同时支持 legacy `role: user | agent` 结构和 `sessionProtocol` envelope。当前 Claude Code 与 Codex 路径发送 turn-start、text/tool/file、turn-end 等 envelope；App reducer 只读兼容旧版本历史消息。

## 当前新增能力

- 双代理支持：Claude Code 与 Codex。
- 机器级 daemon：支持远程创建会话、恢复会话和列出活跃会话。
- Linux systemd 托管：`agenthub daemon install` 生成用户级 `agenthub-daemon.service`，service 使用 `KillMode=process`；CLI bundle 替换时由 `Restart=on-failure` 拉起新版 daemon，避免更新时误杀正在运行的代理会话。
- 托管凭据：按账号存储不同 agent 的 API key/base URL/model override。
- Artifacts：加密的结构化制品，可由 App 创建、编辑、读取、删除。
- 用户 KV：为 App 设置和轻量状态提供账号级加密键值存储。
- Access Keys：会话与机器之间按 `(accountId, sessionId, machineId)` 建立加密访问材料。
- 独立服务端：`agenthub-server standalone` 可使用 PGlite 打包运行，降低自托管门槛。
