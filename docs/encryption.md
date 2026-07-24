# 端到端加密

AgentHub 的设计目标是：服务端可以认证、排序、存储和转发数据，但不读取会话、机器、凭据和制品明文。当前实现中，敏感字段在客户端或 CLI/daemon 侧加密后再上传。

## 账号与认证

- 账号以公钥为身份基础。
- CLI 登录通过二维码请求完成，App 批准后给 CLI 派发机器侧所需材料。
- CLI 不展示账号主密钥，也不能恢复移动端备份码。
- REST 和 Socket.IO 都使用 bearer token；服务端用 privacy-kit 验证并缓存 token 结果。

## 加密域

| 数据 | 服务端模型 | 加密字段 | 说明 |
| --- | --- | --- | --- |
| 会话 metadata | `Session` | `metadata` | 包含项目路径、标题、agent 信息等。 |
| 会话 agentState | `Session` | `agentState` | 代理运行状态、权限状态等。 |
| 会话消息 | `SessionMessage` | `content.c` | `content.t` 固定为 `encrypted`。 |
| 机器 metadata | `Machine` | `metadata` | 机器名称、路径能力、平台信息等。 |
| 机器 daemonState | `Machine` | `daemonState` | daemon 动态状态。 |
| 托管凭据 | `ManagedCredential` | `apiKey`、`baseUrl` | 按账号保存，agent/base label 可用于索引。 |
| Artifacts | `Artifact` | `header`、`body` | 每个 artifact 有自己的 data encryption key。 |
| KV | `UserKVStore` | `value` | key 明文用于索引，value 加密。 |
| Access Key | `AccessKey` | `data` | 连接 session 与 machine 的访问材料。 |

## Wire 编码

会话消息外层结构来自 `@artsum/agenthub-wire`：

```ts
{
  id: string,
  seq: number,
  localId?: string | null,
  content: { t: 'encrypted', c: string },
  createdAt: number,
  updatedAt: number
}
```

`c` 是加密后的字符串编码。服务端只校验外层 schema，不解析明文内容。

解密后的消息 payload 目前兼容 legacy `role: user | agent` 内容和 session protocol envelope。后者用于 turn 生命周期、工具调用、文件、文本和停止事件；服务端不感知两者差异。

## 版本控制

加密值通常带 `version`。更新时客户端提交新版本；接收方根据版本号判断是否覆盖本地缓存。这样可以支持并发设备、重连补拉和 socket 重复事件。

## 服务端仍能看到什么

服务端需要明文保存或推断部分元数据：

- accountId、sessionId、machineId、artifactId 等对象 ID。
- 创建/更新时间、seq、active 状态。
- KV key、credential label/agent 等索引字段。
- push token、usage report 外层 key。

因此文档和产品描述应使用“敏感内容端到端加密”，而不是宣称所有元数据完全不可见。
