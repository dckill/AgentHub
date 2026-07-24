# 快速开始

AgentHub 让你从手机、浏览器或桌面端远程控制本机上的 AI 编码代理。当前仓库包含 Web/移动 App、命令行封装器、后端服务、共享协议包和远程控制 CLI。

## 前置要求

- Node.js 20 或更高版本。
- pnpm 10.11.0（仓库根 `package.json` 指定）。
- 至少安装一个受支持的上游代理：Claude Code 或 Codex CLI。使用默认 Claude 模式前必须确保独立安装的 `claude --version` 成功；AgentHub 通过 stream-json 协议启动该可执行文件，不再捆绑专有 Claude Agent SDK。可用 `AGENTHUB_CLAUDE_EXECUTABLE` 指定非默认路径或名称。
- 如果使用自托管服务端，需要配置 `AGENTHUB_SERVER_URL` 指向你的服务端。

## 安装 CLI

发布包名为 `@artsum/agenthub`，命令名为 `agenthub`：

```bash
npm install -g @artsum/agenthub
```

从源码运行：

```bash
pnpm install
pnpm --filter @artsum/agenthub build
pnpm --filter @artsum/agenthub cli -- --help
```

## 登录与机器注册

```bash
agenthub auth login
agenthub auth status
```

首次登录会生成本机密钥并通过二维码完成账号绑定。CLI 只拿到派生后的机器密钥；主密钥保存在移动端或 Web 端，不从 CLI 暴露。

开发态 authenticated Web 环境用于需要真实登录态的自动化协议与状态验证：

```bash
npx -y pnpm@10.11.0 run env:up:authenticated
```

该命令会启动隔离的本地 server + Web，并基于本地环境 key 创建开发测试账号。Web 端凭证只驻留页面内存，不写入 localStorage/sessionStorage；刷新或关闭页面后需要重新认证。默认验证入口是 `pnpm web:contract:test`、组件测试、类型检查与 production build；除非用户明确要求人工视觉验收，否则不启动浏览器或生成截图。任何 authenticated URL 或查询参数都不得写入 issue、截图或日志。

强制重新绑定：

```bash
agenthub auth login --force
```

该命令会停止 daemon、清除旧凭据和机器 ID，然后重新注册机器。

## 启动代理

```bash
agenthub              # 默认启动 Claude Code
agenthub claude       # 等同于 agenthub
agenthub codex        # 启动 Codex
```

启动后 CLI 会确保 daemon 运行，创建或恢复会话，并把加密后的会话状态同步到服务端。移动端或 Web 端可以扫描二维码、打开会话、发送消息、授权工具调用或停止会话。

## 连接第三方凭据

```bash
agenthub connect claude
agenthub connect codex
agenthub connect status
```

这些命令用于把第三方 API 相关配置接入 AgentHub。托管凭据在服务端按账号保存，但字段在客户端侧加密后再上传。

## Daemon 常用命令

```bash
agenthub daemon start
agenthub daemon stop
agenthub daemon status
agenthub daemon list
agenthub daemon install
agenthub daemon uninstall
```

Daemon 会在运行 `agenthub` 时自动启动，通常无需手动管理。安装自启动不需要 sudo，分别使用 macOS LaunchAgent、Linux systemd user service 或 Windows 启动任务。

Linux 常驻机器建议安装自启动并让 `agenthub-daemon.service` 管理 daemon。该 service 必须包含 `KillMode=process`；更新 CLI 后优先重启 systemd service 并检查 `agenthub daemon status` / `agenthub daemon list`，不要让 systemd inactive 但手动 daemon 长期运行。

## 远程恢复

```bash
agenthub resume <agenthub-session-id>
agenthub-agent spawn --machine <machine-id> --path ~/project --agent codex
agenthub-agent send <session-id> "修复登录问题" --wait
```

`agenthub resume` 通过 AgentHub 会话 ID 找到所属机器并请求该机器 daemon 恢复；`agenthub-agent` 则适合从终端脚本化控制远程机器和会话。

## 常用环境变量

| 变量 | 说明 |
| --- | --- |
| `AGENTHUB_SERVER_URL` | CLI/agent 使用的服务端地址，默认指向线上服务。 |
| `EXPO_PUBLIC_AGENTHUB_SERVER_URL` | App/Web 构建时使用的服务端地址。 |
| `EXPO_PUBLIC_AGENTHUB_SHARE_ORIGIN` | 可选；Native 外部 E2EE 分享链接使用的无路径 HTTPS origin。Web 未设置时只在当前页面本身为 HTTPS 时使用同源 origin；证书或 App Links association 未验证时保持未设置并 fail-closed。 |
| `AGENTHUB_HOME_DIR` | CLI 本地数据目录，默认 `~/.agenthub`。 |
| `AGENTHUB_DISABLE_CAFFEINATE` | 禁用 macOS 防休眠。 |
| `AGENTHUB_EXPERIMENTAL` | 开启实验功能。 |
| `DEBUG` | 输出更详细的调试日志。 |
