# CLI 架构

`packages/agenthub-cli` 发布为 `@artsum/agenthub`，提供 `agenthub` 和 `agenthub-mcp` 两个 bin。主入口是 `packages/agenthub-cli/src/index.ts`。

## 命令总览

| 命令 | 说明 |
| --- | --- |
| `agenthub` / `agenthub claude` | 默认启动 Claude Code，并接入 AgentHub 会话同步。 |
| `agenthub codex` | 启动 Codex 模式。 |
| `agenthub resume <id>` | 通过 AgentHub 会话 ID 请求远程机器恢复。 |
| `agenthub auth ...` | 登录、登出、查看认证状态。 |
| `agenthub connect ...` | 连接 Claude Code/Codex 相关凭据。 |
| `agenthub sandbox ...` | 配置实验性 OS 沙箱。 |
| `agenthub daemon ...` | 管理后台 daemon。 |
| `agenthub notify` | 向已绑定设备发送推送通知。 |
| `agenthub doctor` / `agenthub doctor clean` | 诊断环境并清理残留进程。 |

## Claude 默认路径

- `agenthub` 会把未知参数透传给 Claude。
- `--yolo` 会转为 Claude 的 `--dangerously-skip-permissions`。
- `--model <name>`、`--claude-env KEY=VALUE`、`--js-runtime node|bun` 是 AgentHub 自己处理的启动参数。
- `--settings` 被 AgentHub 内部 session hook 占用，不会透传；用户应改用 `~/.claude/settings.json` 配置 Claude。
- `--chrome` / `--no-chrome` 控制 Claude Chrome 模式，优先级高于本地 settings。

## Daemon

Daemon 位于 `packages/agenthub-cli/src/daemon`，职责是：

- 作为机器级长驻进程连接服务端。
- 维护本机可远程启动/恢复的工作目录和代理会话。
- 通过本地 control server 接收 CLI 控制命令。
- 对外注册 RPC 方法，让 App 或 `agenthub-agent` 可以 spawn、resume、stop。
- 上报 `machine-alive`、机器 metadata、daemonState 和活跃会话列表。

平台安装实现分散在：

- macOS：`src/daemon/mac/install.ts` / `src/daemon/mac/uninstall.ts`，写入 `~/Library/LaunchAgents`。
- Linux：`src/daemon/linux/install.ts` / `src/daemon/linux/uninstall.ts`，写入 `~/.config/systemd/user`。
- Windows：`src/daemon/windows/install.ts` / `src/daemon/windows/uninstall.ts`，使用 `schtasks`。

Linux 常驻机器应优先使用 `agenthub daemon install` 生成用户级 `agenthub-daemon.service`。service 必须包含 `KillMode=process`，并使用 `Restart=on-failure`；CLI bundle 替换时 daemon 会释放 state/lock 后退出，让 systemd 拉起新版。未安装 systemd 自启动时才由 daemon 自己 spawn 新进程。

`agenthub doctor` 基于 `ps-list` 识别 daemon、daemon-spawned session、用户直接启动的 session 和 doctor 进程；Linux 下 `ps-list` 可能把 Node 进程名报为 `MainThread`，识别逻辑会回退检查完整命令行。`agenthub doctor clean` 会递归清理残留 AgentHub 进程树。

## 远程 RPC

session-scoped RPC 默认限制在会话工作目录内；machine-scoped RPC 用于机器级操作，当前不做同样的工作目录限制。公共 handler 包括：

| 方法 | 说明 |
| --- | --- |
| `bash` | 在指定 cwd 执行 shell 命令，默认 30 秒超时。 |
| `readFile` | 读取文件并返回 base64；默认最多读取 2MB，超出时截断到换行边界。 |
| `writeFile` | 写入 base64 文件内容，并用 sha256 hash 做并发保护。 |
| `listDirectory` | 列出目录条目，目录优先排序。 |
| `createDirectory` | 创建目录。 |
| `getDirectoryTree` | 按 `maxDepth` 递归获取目录树，跳过符号链接。 |
| `ripgrep` | 调用仓库内 ripgrep launcher。 |
| `difftastic` | 调用仓库内 difftastic launcher。 |

machine-scoped daemon 额外注册 `spawn-agenthub-session`、`resume-agenthub-session`、`stop-session` 和 `stop-daemon`。

## 远程恢复

`agenthub resume <session-id>` 的流程：

1. 解析 AgentHub session ID 或前缀。
2. 从服务端读取会话 metadata，找到所属 machineId。
3. 检查机器 daemon 是否在线且支持 resume RPC。
4. 发送 RPC 请求到目标机器。
5. 目标机器在对应目录中恢复上游代理会话。

如果目标机器没有 `agenthub-agent` 本地认证或 daemon 没有 RPC 能力，命令会明确报错。

## 本地数据

默认数据目录是 `~/.agenthub`，可用 `AGENTHUB_HOME_DIR` 改写。该目录保存 CLI 凭据、机器 ID、daemon 状态和日志。`agenthub auth logout` 会删除该目录并停止 daemon。
