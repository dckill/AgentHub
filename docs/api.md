# HTTP API

本文档按当前 `packages/agenthub-server/sources/app/api/routes` 中注册的路由整理。除认证请求外，大多数接口都需要 `Authorization: Bearer <token>`。

## 认证

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/v1/auth` | 使用账号公钥、32 字节随机 challenge 及其签名换取 token；同一公钥下的 challenge 只能成功一次，重放返回 `409`。Token 包含 `exp`、`jti`、`keyVersion`，服务端每次鉴权均校验持久化吊销/过期状态。 |
| `POST` | `/v1/auth/request` | 创建/轮询终端二维码登录请求；请求体必须携带客户端生成的 32 字节 `pollingSecret`（Base64）。 |
| `GET` | `/v1/auth/request/status` | 已登录 App 查询终端请求是否待批准；必须携带 Bearer token。 |
| `POST` | `/v1/auth/response` | App 对终端登录请求写入响应。 |
| `POST` | `/v1/auth/account/request` | 创建/轮询账号级登录请求；必须携带 32 字节 `pollingSecret`。请求 5 分钟过期，授权结果只能领取一次。 |
| `POST` | `/v1/auth/account/response` | 响应账号级登录/绑定请求。 |

## 账号与用户

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/v1/account/profile` | 获取当前账号资料。 |
| `GET` | `/v1/account/settings` | 获取账号设置。 |
| `POST` | `/v1/account/settings` | 更新账号设置。 |
| `POST` | `/v1/usage/query` | 查询账号用量。 |
| `GET` | `/v1/user/:id` | 按 ID 获取用户资料。 |
| `GET` | `/v1/user/search` | 搜索用户。 |

## 会话

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/v1/sessions` | 旧版会话列表。 |
| `GET` | `/v2/sessions/active` | 活跃会话列表。 |
| `GET` | `/v2/sessions` | 当前会话列表。 |
| `POST` | `/v1/sessions` | 创建会话。 |
| `GET` | `/v1/sessions/:sessionId/messages` | 获取会话消息。 |
| `POST` | `/v1/sessions/:sessionId/archive` | 归档会话。 |
| `DELETE` | `/v1/sessions/:sessionId` | 删除会话。 |
| `GET` | `/v3/sessions/:sessionId/messages` | V3 消息读取接口。 |
| `POST` | `/v3/sessions/:sessionId/messages` | V3 消息写入接口。 |
| `GET` | `/v4/sync` | 按账号 cursor 读取持久化同步事件；需要快照时返回 `requiresSnapshot=true`。 |

## 机器

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/v1/machines` | 注册或更新机器。 |
| `GET` | `/v1/machines` | 获取账号机器列表。 |
| `GET` | `/v1/machines/:id` | 获取单台机器。 |
| `DELETE` | `/v1/machines/:id` | 删除/停用机器。 |

## 托管凭据

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST` | `/v1/credentials` | 创建代理凭据。 |
| `GET` | `/v1/credentials` | 列出凭据。 |
| `GET` | `/v1/credentials/:id` | 获取单个凭据。 |
| `POST` | `/v1/credentials/:id` | 更新凭据。 |
| `DELETE` | `/v1/credentials/:id` | 删除凭据。 |
| `GET` | `/v1/credentials/:id/env-vars` | 获取注入代理进程所需环境变量。 |

## Artifacts

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/v1/artifacts` | 列出 artifacts。 |
| `GET` | `/v1/artifacts/:id` | 读取 artifact。 |
| `POST` | `/v1/artifacts` | 创建 artifact。 |
| `POST` | `/v1/artifacts/:id` | 更新 artifact。 |
| `DELETE` | `/v1/artifacts/:id` | 删除 artifact。 |

## KV、推送、Access Key 与版本

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `GET` | `/v1/kv/:key` | 读取单个 KV。 |
| `GET` | `/v1/kv` | 列出 KV。 |
| `POST` | `/v1/kv/bulk` | 批量读取 KV。 |
| `POST` | `/v1/kv` | 写入或删除 KV。 |
| `POST` | `/v1/push-tokens` | 注册 push token。 |
| `DELETE` | `/v1/push-tokens/:token` | 删除 push token。 |
| `GET` | `/v1/push-tokens` | 列出 push token。 |
| `GET` | `/v1/access-keys/:sessionId/:machineId` | 读取 access key。 |
| `POST` | `/v1/access-keys/:sessionId/:machineId` | 创建或更新 access key；创建时不传 `expectedVersion`，更新时传 `expectedVersion`。 |
| `POST` | `/v1/version` | 上报或检查客户端版本。 |

## 开发调试

`POST /logs-combined-from-cli-and-mobile-for-simple-ai-debugging` 是开发调试日志入口，受调试 secret 控制，不应作为公开产品 API 使用。
