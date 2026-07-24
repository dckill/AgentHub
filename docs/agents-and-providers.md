# Agents 与 Provider

AgentHub 当前只提供 Claude Code 与 Codex 两个运行时入口。入口命令由 `packages/agenthub-cli/src/index.ts` 分发，具体实现位于 `src/claude` 与 `src/codex`。客户端仍可只读解析旧版本写入的通用历史消息，但不会据此创建、认证或配置已移除的 Provider。

## Claude

```bash
agenthub
agenthub claude
```

Claude 是默认路径。AgentHub 会启动独立安装的 Claude Code，把 CLI 参数透传给 Claude，并通过 stream-json transport 与 hook 把消息和状态同步到 AgentHub 会话。

常用 AgentHub 扩展参数：

- `--yolo`：映射到 Claude 的跳过权限参数。
- `--model <model>`：指定模型。
- `--claude-env KEY=VALUE`：给 Claude 进程注入环境变量。
- `--agenthub-starting-mode local|remote`：控制初始模式。
- `--js-runtime node|bun`：选择 JS runtime。



## Codex

```bash
agenthub codex
```

Codex 路径包含本地 CLI 适配、权限/沙箱参数处理和 AgentHub 会话同步。`package.json` 中还导出 `./codex/agenthubMcpStdioBridge`，用于 Codex MCP stdio bridge 集成。

## 托管凭据

`agenthub connect claude|codex` 与 App 设置中的凭据页面配合使用。服务端只保存客户端加密后的凭据密文，代理进程启动时可通过受认证接口取得相应环境变量。
