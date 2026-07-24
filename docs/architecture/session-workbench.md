# Session Workbench Architecture

## Positioning

AgentHub 手机端是电脑端官方工具的补充接管层，不是整台机器的历史会话浏览器。

## Default Surface

默认会话首页只显示当前工作台：

- AgentHub 正在运行、可继续、需要处理权限或刚完成的任务。
- 用户已经接入 AgentHub 的官方 Codex/Claude 会话。
- 当前项目根目录下折叠展示的少量电脑端会话候选；每个项目默认最多展示 5 条最近候选。

默认首页不显示全机历史、不显示隐藏候选、不显示 debug id、不显示 provider 原始文件格式。

## Project Boundary

项目使用 `machineId + path` 标识。`path` 是用户当前工作项目的根目录，不是任意父目录或子目录。

官方候选必须以项目根目录启动：规范化尾部 `/` 后，候选 `cwd` 必须与项目 `path` 完全一致。`cwd` 是项目子目录、父目录、用户 home 目录或其他目录时，都不属于该项目的默认候选。

高级恢复可以帮助用户找到历史会话，但恢复动作不改变默认项目边界。要进入某个项目工作台，历史会话仍应被接管为该项目根目录下的 AgentHub 任务。

## User Vocabulary

- AgentHub session row: 任务
- Official Codex/Claude row: 电脑端会话
- Resume or mirror action: 接管
- Default finish/remove action: 移出工作台
- Archived AgentHub record: 已归档会话
- Full-machine search: 高级恢复

## Lifecycle Rules

- “移出工作台”是默认结束类前台动作，表示用户不再希望这个条目出现在当前工作台。
- 对 AgentHub session，“移出工作台”会先停止运行中的 runner，再调用 server archive；会话记录和消息仍可在已归档会话中找回。
- 对电脑端会话候选，“移出工作台”会记录 ignore/hide；官方 Codex/Claude 源文件不删除，也不模拟 provider 不支持的归档能力。
- 对项目，“隐藏项目”会移出该项目下活跃 AgentHub session，并隐藏剩余电脑端候选，直到该项目重新出现活动任务或用户恢复。
- “永久删除会话”只放在危险区，用于删除本应用记录、消息、usage 和 access keys；它不是默认收尾动作，且不可撤销。
- 接管官方候选后，主列表只显示新的 AgentHub session，原候选从该项目候选区消失。

## Control Ownership

接管是一套控制权协议，不是单纯的导航动作。AgentHub 接管后的会话记录、消息流和运行状态是手机端与电脑端 AgentHub 客户端共同读取的事实源。

```txt
computer_observing
│
├─ user opens candidate
│  └─ mirror_only
│     ├─ Codex: poll/read official thread
│     └─ Claude: scan transcript jsonl
│
├─ user sends mobile message
│  ├─ Codex active turn exists
│  │  └─ steer active turn
│  ├─ Codex idle or steer rejected
│  │  └─ queue as next AgentHub-managed turn
│  └─ Claude
│     └─ stop mirror scanner, resume through AgentHub runner
│
└─ user returns to computer
   └─ continue the AgentHub session, not a separate parallel writer
```

- Codex 可以在已有活跃 turn 中追加手机端引导；如果官方 turn 不可 steer，则回退为下一轮消息。
- Claude 接管后不允许把官方原终端和 AgentHub runner 当作两个并行写入者；手机首条消息后由 AgentHub runner 继续写入，原 transcript 只作为接管前导入来源。
- 官方原客户端是否实时显示手机消息是 provider 能力边界内的 best-effort；产品承诺是 AgentHub 会话内手机端和电脑端状态一致。
- 所有控制权切换都必须触发消息补抓或状态刷新，避免手机端显示旧的 thinking/tool 状态。
- runner 在 SIGTERM/SIGINT/移出工作台/异常退出时必须补齐 active turn 的 `turn-end`，并关闭 thinking。

## Non-Goals

- 不重写 Codex/Claude 官方存储格式。
- 不把 Claude 不支持归档的事实暴露给普通用户。
- 不在默认首页提供全机搜索。
- 不让用户理解 provider branch、mirror branch、official branch 这些内部概念。
