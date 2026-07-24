# Sandbox

AgentHub CLI 包含实验性 OS 级沙箱能力，相关代码在 `packages/agenthub-cli/src/sandbox`。沙箱用于限制代理进程的文件系统和网络访问，降低远程授权和自动执行命令的风险。

## 命令

```bash
agenthub sandbox configure
agenthub sandbox status
agenthub sandbox disable
```

## 启动参数

CLI 会解析 AgentHub 自己的 sandbox flag，并避免错误透传给上游代理。部分代理命令也可使用 `--no-sandbox` 跳过 AgentHub 沙箱。

## 适用范围

- 这是实验功能，具体隔离强度依赖操作系统和当前 runtime。
- 它不能替代代码审查、最小权限 API key、独立开发环境或容器隔离。
- 需要网络访问的测试可通过 `AGENTHUB_RUN_SANDBOX_NETWORK_TESTS` 控制。

## 文档边界

旧文档中的 sandbox runtime 规划草案已删除。本文件只描述仓库当前存在的 CLI 配置与管理能力；具体策略应以 `src/sandbox/config.ts` 和 `src/sandbox/manager.ts` 为准。
