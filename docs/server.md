# Server 架构

`packages/agenthub-server` 是 AgentHub 的同步后端，基于 Fastify、Socket.IO、Prisma、Postgres/PGlite、Redis Streams 和可选 S3/MinIO。

## 启动入口

- `sources/main.ts`：常规服务入口。
- `sources/app/api/api.ts`：创建 Fastify、注册 CORS、认证、错误处理、监控、HTTP 路由和 Socket.IO。
- `sources/standalone.ts`：独立发行入口，支持 `migrate` 与 `serve`，默认用 PGlite。

默认监听 `PORT`，未设置时为 `13017`。

## 主要模块

| 模块 | 说明 |
| --- | --- |
| `app/auth` | privacy-kit token 生成、验证和 token cache。 |
| `app/api/routes` | REST API 路由。 |
| `app/api/socket` | Socket.IO 事件处理器。 |
| `app/events/eventRouter.ts` | 按账号、会话、机器连接类型转发事件。 |
| `app/kv` | 用户级 KV 读写。 |
| `app/presence` | 活跃 session/machine 的短期状态。 |
| `storage/db.ts` | Prisma/PGlite 数据库适配。 |
| `storage/files.ts` | 本地或对象存储文件访问。 |
| `storage/uploadImage.ts` | 图片上传与处理。 |
| `app/monitoring` | Prometheus 指标。 |

## 数据模型

Prisma schema 中当前核心模型包括：

- `Account`：账号、公钥、资料、设置和 feed seq。
- `TerminalAuthRequest` / `AccountAuthRequest`：二维码登录请求。
- `Session` / `SessionMessage`：加密会话 metadata、agentState 和消息。
- `Machine`：加密机器 metadata、daemonState、在线状态。
- `ManagedCredential`：托管代理凭据。
- `Artifact`：加密制品 header/body。
- `AccessKey`：机器访问会话所需的加密材料。
- `UserKVStore`：账号级键值存储，key 明文用于索引，value 加密。
- `UsageReport`：用量上报。
- `AccountPushToken`：移动端推送 token。
- `UploadedFile`：上传文件及图片信息。

## CORS 与认证

- CORS 允许来源由 `ALLOWED_ORIGINS` 或默认策略解析。
- REST 请求使用 `Authorization: Bearer <token>`。
- Socket.IO 在 handshake 的 `auth.token` 中传 token，并可附带 `clientType`、`sessionId`、`machineId`。
- 认证成功后，服务端在 request/socket 上注入 `userId`。

## 多进程

当设置 `REDIS_URL` 时，Socket.IO 启用 `@socket.io/redis-streams-adapter`。这让多个服务副本之间共享广播事件。当前 `connectionStateRecovery` 仍关闭；客户端重连后走完整 REST 重新拉取路径，保持与旧生产行为一致。

## 文件存储

- 本地存储模式下，服务端开放 `/files/*` 读取本地文件目录，并做路径逃逸检查。
- S3/MinIO 相关配置见 [部署](./deployment.md)。
