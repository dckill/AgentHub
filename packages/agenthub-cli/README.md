# AgentHub CLI

在电脑上运行 Claude Code 或 Codex，并通过 AgentHub App、Web 或远程控制 CLI 安全地继续会话。

## 安装

```bash
npm install -g @artsum/agenthub
```

包名是 `@artsum/agenthub`，安装后的命令是 `agenthub` 和 `agenthub-mcp`。需要 Node.js 20 或更高版本。

## 启动会话

先安装并登录对应的官方 CLI：

```bash
claude --version
codex --version
```

然后启动 AgentHub 会话：

```bash
agenthub claude
agenthub codex
```

`agenthub` 不带子命令时默认启动 Claude Code。当前产品运行时只支持 Claude Code 与 Codex。

## 登录与 daemon

```bash
agenthub auth login
agenthub auth status
agenthub daemon install
agenthub daemon status
agenthub daemon list
```

daemon 让 App 或 Web 在电脑在线时远程创建、恢复和停止会话。Linux 长驻机器应使用 `agenthub daemon install` 创建的 systemd user service；该 service 使用 `KillMode=process`，daemon 更新时不会直接杀死仍需完成终态收敛的 runner。

常用管理命令：

```bash
agenthub daemon start
agenthub daemon stop
agenthub daemon uninstall
agenthub doctor
agenthub doctor clean
```

`doctor clean` 会处理失联或陈旧的本机会话进程，执行前请先检查诊断输出。

## 恢复会话

```bash
agenthub resume <agenthub-session-id>
```

会话恢复请求会发送给原机器上的 daemon。目标机器必须在线，且对应 Claude Code 或 Codex CLI 仍可用。

## 环境变量

| 变量 | 说明 |
| --- | --- |
| `AGENTHUB_SERVER_URL` | 服务端地址；默认 `https://agenthub.yzsd.asia:8443`。 |
| `AGENTHUB_WEBAPP_URL` | Web App 地址。 |
| `AGENTHUB_HOME_DIR` | 本地数据目录；默认 `~/.agenthub`。 |
| `AGENTHUB_CLAUDE_EXECUTABLE` | Claude Code 可执行文件路径或名称。 |
| `AGENTHUB_DISABLE_CAFFEINATE` | 禁用 macOS 防休眠。 |
| `AGENTHUB_EXPERIMENTAL` | 启用实验功能。 |

## 从源码构建

在 monorepo 根目录执行：

```bash
npx -y pnpm@10.11.0 install
npx -y pnpm@10.11.0 --filter @artsum/agenthub build
npx -y pnpm@10.11.0 --filter @artsum/agenthub cli -- --help
```

发布前使用：

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub test
```

## 许可证

MIT。CLI 内置工具的第三方许可证位于 `tools/licenses/`。
