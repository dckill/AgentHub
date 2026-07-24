# agenthub-agent

`packages/agenthub-agent` 是独立远程控制 CLI。它不像 `agenthub-cli` 那样负责启动本地代理主流程，而是通过 AgentHub Server 和在线机器 daemon 控制已有或新建会话。

## 安装与登录

```bash
pnpm --filter agenthub-agent build
cd packages/agenthub-agent && npm link
agenthub-agent auth login
agenthub-agent auth status
```

凭据默认保存到 `~/.agenthub/agent.key`。

## 命令

| 命令 | 说明 |
| --- | --- |
| `agenthub-agent auth login` | 扫码登录。 |
| `agenthub-agent auth logout` | 清除本地凭据。 |
| `agenthub-agent auth status` | 查看登录状态。 |
| `agenthub-agent machines [--active] [--json]` | 列出机器。 |
| `agenthub-agent list [--active] [--json]` | 列出会话。 |
| `agenthub-agent status <session-id> [--json]` | 查看会话实时或缓存状态。 |
| `agenthub-agent spawn --machine <id> --path <path>` | 在远程机器上启动会话。 |
| `agenthub-agent create --tag <tag>` | 直接创建会话记录。 |
| `agenthub-agent send <session-id> <message>` | 向会话发送消息。 |
| `agenthub-agent history <session-id>` | 查看消息历史。 |
| `agenthub-agent stop <session-id>` | 停止会话。 |
| `agenthub-agent wait <session-id>` | 等待代理空闲。 |

## 常见脚本化示例

```bash
agenthub-agent machines --active --json
agenthub-agent spawn --machine abc --path ~/repo --agent codex --json
agenthub-agent send c123 "运行测试并修复失败" --wait --json
agenthub-agent history c123 --limit 20
```

`session-id` 和 `machine-id` 支持前缀匹配，但如果匹配多个对象会报错，避免误操作。
