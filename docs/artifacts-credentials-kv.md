# Artifacts、Credentials 与 KV

当前 AgentHub 不只同步聊天消息，还支持加密制品、托管代理凭据和用户级键值存储。

## Artifacts

Artifacts 是账号级加密文档/制品，服务端模型为 `Artifact`：

- `id`：客户端提供的 UUID。
- `header`：加密头部，可保存标题、类型、描述等 JSON。
- `body`：加密正文。
- `dataEncryptionKey`：artifact 自己的数据密钥。
- `headerVersion` / `bodyVersion` / `seq`：用于并发更新和同步合并。

App 页面位于 `sources/app/(app)/artifacts`，支持列表、新建、编辑、读取和删除。HTTP 和 Socket.IO 都有对应接口。

## Managed Credentials

`ManagedCredential` 用于保存第三方 agent 凭据：

- 明文字段：`label`、`agent`、`lastUsedAt` 等索引或展示字段。
- 加密字段：`apiKey`、`baseUrl`。
- `modelOverrides`：模型相关 override 配置。

CLI 可通过：

```bash
agenthub connect claude
agenthub connect codex
agenthub connect status
```

App 设置中也有凭据管理页面。

## User KV Store

KV 用于保存账号级轻量状态：

- `key` 明文保存，方便索引和批量读取。
- `value` 加密保存；为空可表示删除。
- `version` 用于冲突处理。

API 支持单个读取、列表、批量读取和写入。适合 App 设置、功能开关、轻量同步状态，不适合大文件或消息流。

## Access Keys

`AccessKey` 以 `(accountId, machineId, sessionId)` 唯一，用于机器访问会话时交换加密材料。它不是用户可见功能，但对远程 spawn/resume 和跨设备会话访问很重要。
