# Claude / Codex Transport 可靠性契约

这份契约约束两条 transport 的**可观察行为**，不要求实现共享。Claude 由官方 SDK 负责协议解析与连接恢复；Codex 使用 app-server 的 newline-delimited JSON-RPC，因此两侧的适配位置可以不同，但每次可靠性改动都必须逐项核对本表。

| 契约 | Claude 适配位置 | Codex 适配位置 | 状态 |
|---|---|---|---|
| 进程级异常必须进入统一退出/收口路径，并补齐活动 turn 的 `turn-end` | `src/sessionProtocol/processSignalHandlers.ts`；`src/claude/claudeRemote.ts` 的失败收口 | `src/sessionProtocol/processSignalHandlers.ts`；`src/sessionProtocol/RunnerShutdownCoordinator.ts` | 已落地，需两侧回归 |
| 连接中断不能遗留“思考中”；恢复或失败必须进入可观察终态 | SDK 生命周期 + `src/claude/claudeRemote.ts` 的 `updateThinking(false)` | `src/codex/codexAppServerClient.ts` 的 `reconnectAndResumeThread()` 与终态映射 | 已落地，SDK 内部行为需版本验收 |
| 每个 turn 的终态只能对外发出一次，重复/混合协议通知必须幂等 | SDK 事件流由 Claude 适配层收口 | `src/codex/codexAppServerClient.ts` 与 `src/codex/utils/sessionProtocolMapper.ts` | 已落地，保持有界去重 |
| 终态必须携带可归因的状态（completed / aborted / failed）；用户取消、后端失败、超时不能静默混为成功 | `src/claude/claudeRemote.ts` 的失败分支 | Codex 的 `task_complete` / `turn_aborted` 映射；`sendTurnAndWait` 返回 timeout/interrupt/backend-failure reason | 三类 reason 已落地，`aborted` 保持兼容 |
| 审批等待的超时、取消和后端断连必须清理 pending approval，且不能在原请求恢复后重复应答 | SDK 负责审批生命周期；CLI 只记录适配结果 | `src/codex/codexAppServerClient.ts` 的一次性 approval responder 与 turn 收口 | Codex timeout/abort 清理和晚到响应抑制已落地；Claude 依赖 SDK 版本验收 |
| 协议解析错误必须可观测且不能阻塞后续 turn | SDK 负责输入校验 | `src/codex/codexAppServerClient.ts` 的行解析与字段守卫 | 已落地；混合 legacy/raw 丢弃路径按 S-13 保持 warn |

Codex `sendTurnAndWait` 的终态 reason 类型为 `reason: 'timeout' | 'interrupt' | 'backend-failure'`（S-14）；`aborted` 只作为兼容布尔字段保留。

## 变更门禁

1. 修改任一 transport 的解析、重连、审批或终态逻辑时，必须在本表逐项注明另一侧的对应位置和测试。
2. 不能因为 Claude 由 SDK 托管就删除 CLI 侧的终态/异常回归；应记录 SDK 版本与人工验收边界。
3. 修改任一 reason 或 approval 收口时，必须同步更新三类 reason 的调用方测试和本表；`aborted` 只能作为兼容布尔字段保留。
