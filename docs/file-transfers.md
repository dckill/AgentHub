# 文件传输

AgentHub 当前支持把在线机器上的文件下载到 App。传输方向只有 `machine → App`；它不是通用双向文件同步，也不会把远程文件长期保存到 AgentHub Server。

## 用户入口

- 机器详情页可进入机器文件浏览器。
- 选择远程文件后可创建下载任务。
- 机器列表和机器详情页可进入传输中心，并按失败、进行中、暂停或最近完成筛选。
- 传输中心支持查看进度、暂停、继续、重试、取消和删除记录。

App 路由位于：

- `sources/app/(app)/machine/[id]/files.tsx`
- `sources/app/(app)/transfers.tsx`

## 数据流

```text
App fileTransferStore
  └─ file-transfer-start
       ▼
AgentHub Server
  └─ 按账号 + machineId 转发控制请求
       ▼
machine-scoped daemon
  └─ 校验和读取远程文件，分块发送 file-transfer-chunk
       ▼
Server 转发 chunk
       ▼
App 写入临时文件，完成后移动到目标目录
```

Server 只转发控制消息和分块，不将文件作为持久化对象保存。控制参数在 App 与 daemon 的机器加密域内编码；服务端负责鉴权、定位在线机器和转发。

## 可靠性与边界

- 每次尝试都有独立 `attemptId`，旧尝试到达的 chunk 会被视为过期数据。
- chunk 带 offset、长度和完成标记；App 会拒绝错位、重叠或大小不一致的数据。
- 中途断开后，重试从本地临时文件大小继续，不必从零开始。
- 取消请求会转发到负责读取文件的 daemon。
- App 本地保存任务和下载目录设置；退出账号会清除账号相关任务，但保留设备级下载目录偏好。
- Android 可选择 Storage Access Framework 目录；未选择时使用 App 私有目录。
- 删除传输记录默认不删除已经下载的文件，也可以显式选择同时删除本地文件。

## 主要实现

| 层 | 文件 |
| --- | --- |
| App 状态与续传 | `packages/agenthub-app/sources/sync/fileTransferStore.ts` |
| App Socket 协议 | `packages/agenthub-app/sources/sync/fileTransferSocket.ts`、`apiSocket.ts` |
| App 任务模型 | `packages/agenthub-app/sources/utils/fileTransfers.ts` |
| daemon 文件读取 | `packages/agenthub-cli/src/api/apiMachine.ts` |
| Server 转发 | `packages/agenthub-server/sources/app/api/socket/fileTransferHandler.ts` |

## 安全注意事项

- 只有已认证的 user-scoped App 能请求自己账号下在线机器的文件。
- 只有对应 machine-scoped socket 能发送文件块。
- daemon 必须继续执行工作目录、路径规范化、符号链接和大小限制等现有 RPC 安全边界。
- 文件可能包含敏感信息；App 下载后的本地文件不再受服务端 E2EE 生命周期控制，备份与删除由设备系统和用户负责。
