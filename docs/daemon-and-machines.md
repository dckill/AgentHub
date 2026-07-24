# Daemon 与机器

机器是 AgentHub 远程控制的基本执行单元。每台登录过的电脑会注册为 `Machine`，daemon 作为该机器的在线控制进程。

## 机器模型

`Machine` 记录：

- `id`：机器 ID。
- `accountId`：所属账号。
- `metadata`：加密静态信息，例如主机名、平台、可用目录和能力。
- `daemonState`：加密动态状态，例如当前会话、RPC 能力和启动状态。
- `active` / `lastActiveAt`：服务端可见的在线/活跃状态。
- `dataEncryptionKey`、`seq`、版本字段：加密和同步辅助信息。

## Daemon 生命周期

```bash
agenthub daemon start
agenthub daemon status
agenthub daemon list
agenthub daemon stop
agenthub daemon install
agenthub daemon uninstall
```

- `start`：分离启动后台进程。
- `stop`：停止 daemon，但不会强制杀掉所有代理会话。
- `list`：列出 daemon 管理的活跃会话。
- `install` / `uninstall`：安装或移除登录自启动。
- `doctor clean`：清理残留 AgentHub 相关进程。

## Linux systemd 标准方案

Linux 用户级自启动必须用 `agenthub daemon install` 生成 `~/.config/systemd/user/agenthub-daemon.service`，不要长期混用手动 daemon 和 systemd daemon。

服务文件必须包含：

```ini
[Service]
Type=simple
ExecStart=.../node --no-warnings --no-deprecation .../dist/index.mjs daemon start-sync
Restart=on-failure
RestartSec=5
KillMode=process
```

`KillMode=process` 是必须项：daemon 会分离启动 agent 会话，systemd 停止或重启 daemon 时只能杀 daemon 主进程，不能清理同 control group 下的 agent 子进程。否则 CLI 更新触发 daemon 重启时，正在思考的 Codex/Claude 会话可能被 systemd 一起杀掉，服务端只留下未结束的 turn，App 会一直显示“思考中”，归档/删除也可能被本地未收敛状态拖住。

标准检查命令：

```bash
systemctl --user cat agenthub-daemon.service
systemctl --user status agenthub-daemon.service --no-pager
agenthub daemon status
agenthub daemon list
```

如果 `systemctl --user status agenthub-daemon.service` 显示 inactive，但 `agenthub daemon status` 显示 daemon 正在运行，说明当前 daemon 很可能是手动/旧自重启路径拉起的非 systemd 进程。恢复为标准状态：

```bash
agenthub daemon stop
systemctl --user daemon-reload
systemctl --user restart agenthub-daemon.service
agenthub daemon status
```

## CLI 更新与 daemon 重启

更新或本地构建 `agenthub-cli` 会替换 `packages/agenthub-cli/dist/index.mjs`。daemon 每 60 秒检查该文件 mtime：

- systemd 启动的 daemon：释放本地 state/lock 后退出为 failure，让 `Restart=on-failure` 拉起新版。
- 非 systemd 启动的 daemon：释放本地 state/lock 后自 spawn 新 daemon。

发布或本机更新时优先使用 systemd 托管路径：

```bash
systemctl --user stop agenthub-daemon.service
npx -y pnpm@10.11.0 --filter @artsum/agenthub build
systemctl --user start agenthub-daemon.service
agenthub daemon status
```

如果机器上有活跃会话，优先等待会话完成或主动停止会话，再更新 CLI。必须热更新时，`KillMode=process` 和各 runner 的 shutdown cleanup 会尽量把 active turn 收敛为 `cancelled`，但仍应通过 `agenthub daemon list` 和 App 状态确认没有遗留会话。

智能体代为执行重启或清理时必须遵守额外检查：

1. 重启前记录 `agenthub daemon list`、`systemctl --user status agenthub-daemon.service --no-pager` 和相关 `ps` 进程。
2. 如果 Codex runner 的 app-server 已退出、被 `SIGKILL`、或日志出现 `stdin not writable`，runner 必须把 AgentHub 会话归档并退出；不要继续接受新消息。
3. 重启后确认只剩一个 `agenthub-daemon.service` 托管 daemon，且 `agenthub daemon list` 与实际 runner 进程一致。
4. App 项目列表里，失联的 AgentHub 镜像会话不能遮挡官方索引；只兜底显示官方未归档的 Codex/Claude 会话。

## Stuck Thinking 恢复

典型症状：App 中会话一直“思考中”，最后一条用户消息之后没有 assistant 输出，归档/删除无效；daemon 日志附近出现 bundle replaced、daemon restart、systemd stop/restart 或本地构建。

排查顺序：

```bash
agenthub daemon status
agenthub daemon list
systemctl --user status agenthub-daemon.service --no-pager
ls -lt ~/.agenthub/logs | head
agenthub doctor
```

恢复顺序：

```bash
# 1. 先恢复 daemon 管理面
agenthub daemon stop
systemctl --user restart agenthub-daemon.service

# 2. 如果仍有旧 AgentHub 进程脱离当前 daemon 管理，再清理
agenthub doctor clean
systemctl --user restart agenthub-daemon.service

# 3. 最后在 App 中重新进入/归档会话
agenthub daemon status
agenthub daemon list
```

不要直接删除仓库 `dist/` 或反复本地构建来“刷新”卡住会话；这会继续触发 daemon 替换路径，扩大状态分裂。

## 在线状态

daemon 使用 `machine-scoped` Socket.IO 连接。连接建立时服务端向用户级客户端广播机器在线；断开时广播离线。daemon 还会主动发送 `machine-alive` 和机器 state 更新。

## 远程启动

App 或 `agenthub-agent` 可以选择在线机器和工作目录，调用机器 RPC 创建会话。目标机器决定目录是否存在、是否允许创建目录、启动哪个 agent，并返回 session 信息或错误。

## 远程恢复

恢复需要同时满足：

- 目标机器在线。
- 会话 metadata 中有 machineId。
- daemon 上报 `resumeSupport.rpcAvailable=true`。
- 目标机器环境已完成本地认证。

否则 `agenthub resume` 或 `agenthub-agent resume` 会给出不可恢复原因。
