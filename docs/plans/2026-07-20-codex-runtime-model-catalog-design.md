# Codex 运行时模型目录设计

## 目标

AgentHub 不再为 Codex 维护具体模型白名单。本机 Codex app-server 的 `model/list` 是模型可用性、默认模型和 reasoning effort 的权威来源；AgentHub 只负责安全传输、短期缓存和界面展示。

## 数据流

新建会话时，App 通过加密的机器 RPC `codex-list-models` 请求所选机器和目录的模型目录。daemon 使用对应目录和可选凭据环境启动短生命周期 app-server，分页读取全部可见模型。结果按 Codex CLI 版本、目录和凭据环境指纹缓存五分钟；过期数据立即作为 stale 快照返回，同时后台刷新。

活跃 Codex runner 在 app-server 初始化后再次读取目录，并发布到加密 session metadata。这样会话内选择器始终以实际 runner 的认证和配置边界为准。

## 兼容与失败策略

- App 仅硬编码 `default model`；目录不可用时仍可创建和使用会话。
- 模型 ID 与 effort ID 按不透明字符串传输，允许 Codex 增加新值而无需 AgentHub 发版。
- 旧 session metadata 的 `{code, value, description}` 仍然有效；新增字段全部可选。
- 创建页加载期间显示轻量进度状态；失败时提供可访问的重试操作。
- 模型目录按 runtime 原始顺序展示，隐藏模型不进入默认选择器。

## 验证

集中测试覆盖 wire schema、app-server 分页、机器 RPC 与 stale-while-revalidate、App RPC、metadata 映射、按模型 effort 和消息 effort 透传。阶段结束运行 wire、CLI、App 类型检查，CLI production build 与相关包完整自动化回归。
