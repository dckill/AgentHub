# agenthub-wire

`packages/agenthub-wire` 发布为 `@artsum/agenthub-wire`，提供客户端、CLI、agent 和 server 共享的 Zod schema 与 TypeScript 类型。

## 当前导出

- `messages.ts`：生产路径使用的消息、加密内容、session/machine update container。
- `legacyProtocol.ts`：旧版 `role: user | agent` 明文结构类型；加密后作为消息内容的一部分使用。
- `sessionProtocol.ts`：当前生产路径使用的统一 session envelope 类型，用于 turn、文本、工具调用、文件和状态事件。
- `v4Sync.ts`：账号级持久化同步事件响应 schema，用于 `/v4/sync`。
- `index.ts`：统一 re-export。

## 生产协议状态

当前生产路径兼容两类加密后的消息内容：

```ts
MessageContent = UserMessage | AgentMessage | SessionProtocolMessage
```

legacy 消息仍使用 `role: 'user' | 'agent'`；现代 session protocol 使用外层 `role: 'session'`，内容里是 `SessionEnvelope`，其中 envelope role 仍限制为 `user` 或 `agent`。服务端不解密内容，只校验和转发加密容器。生产会话消息外层为：

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

服务端广播更新使用：

- `new-message`：新增会话消息。
- `update-session`：更新会话 metadata 或 agentState。
- `update-machine`：更新机器 metadata、daemonState 或 active 状态。

`v4Sync.ts` 当前只覆盖持久化事件日志的三类事件：`session-updated`、`session-deleted`、`message-created`。客户端收到 `requiresSnapshot=true` 时应回退到完整快照拉取。

## 维护规则

- schema 变更必须同步更新 server、app、CLI 和测试。
- 新字段应显式使用 `.optional()` 或 `.nullable()`，不要用隐式 undefined 语义。
- 删除字段前应先保留兼容 alias 或迁移逻辑。
- 修改 `sessionProtocol.ts` 时必须同步更新 CLI mapper、App reducer/raw type、wire tests 和协议 inventory 测试；尤其要保证 active turn 都能以 `turn-end` 收敛，避免客户端长期显示“思考中”。
