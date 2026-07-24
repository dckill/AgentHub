# 实时同步与 RPC

AgentHub 使用 Socket.IO 作为实时通道，路径为 `/v1/updates`。HTTP REST 提供快照和持久化接口，Socket.IO 提供低延迟事件、presence、会话消息和 RPC。

## 连接类型

客户端在 handshake 的 `auth` 中声明：

| `clientType` | 必要字段 | 典型来源 | 作用 |
| --- | --- | --- | --- |
| `user-scoped` 或空 | 无 | App/Web | 接收账号范围的会话、机器、artifact、presence 更新。 |
| `session-scoped` | `sessionId` | 单个代理会话 CLI | 只接收/发送某个会话相关事件。 |
| `machine-scoped` | `machineId` | daemon | 上报机器在线、处理机器 RPC。 |

所有连接都需要 `auth.token`。服务端验证后加入 `eventRouter`，断开时移除连接并广播机器离线状态。

## 当前 socket 事件

| 事件 | 方向 | 说明 |
| --- | --- | --- |
| `message` | client → server | 写入会话消息并广播。 |
| `update-metadata` | client → server | 更新会话 metadata。 |
| `update-state` | client → server | 更新会话 agentState。 |
| `session-alive` | client → server | 上报会话活跃。 |
| `session-end` | client → server | 标记会话结束。 |
| `machine-alive` | daemon → server | 上报机器在线。 |
| `machine-update-metadata` | daemon → server | 更新机器静态 metadata。 |
| `machine-update-state` | daemon → server | 更新 daemonState。 |
| `artifact-read` | client → server | 通过 socket 读取 artifact。 |
| `artifact-create` | client → server | 创建 artifact。 |
| `artifact-update` | client → server | 更新 artifact。 |
| `artifact-delete` | client → server | 删除 artifact。 |
| `access-key-get` | client → server | 查询会话/机器 access key。 |
| `usage-report` | client → server | 上报用量。 |
| `ping` | client → server | 健康检查。 |

服务端广播的核心更新符合 `@artsum/agenthub-wire` 中 `CoreUpdateContainerSchema`：`new-message`、`update-session`、`update-machine`。

## RPC

RPC 事件由 `rpcHandler` 管理：

- `rpc-register`：连接声明自己可处理某个方法。
- `rpc-unregister`：取消方法注册。
- `rpc-call`：调用目标方法并通过 callback 返回结果。
- `rpc-registered` / `rpc-unregistered` / `rpc-error`：注册反馈。

典型用法是 App 或 `agenthub-agent` 调用机器 daemon 的远程 spawn/resume/stop 能力。RPC 不替代 REST 持久化；它只负责在线设备之间的控制请求。

## 重连策略

- Socket.IO 支持 websocket 和 polling，并允许升级。
- 服务端配置 `pingInterval=15000`、`pingTimeout=45000`。
- Redis Streams adapter 开启时支持跨副本广播。
- 当前未启用 Socket.IO connection state recovery；客户端重连后应重新 REST 拉取快照，避免漏事件。

## 排序与版本

会话、机器、artifact、KV 等对象都带版本号或 seq。客户端 reducer 必须用版本号/seq 做幂等合并，避免重连、重复广播或跨副本延迟造成状态回退。
