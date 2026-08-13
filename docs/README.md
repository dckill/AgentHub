# AgentHub 文档

本目录以当前 AgentHub 1.0 的工程事实、部署方式、验证入口和长期维护规则为主。权威审计、收口矩阵与总实施计划保留在 `docs/audits/` 和 `docs/superpowers/plans/`；其余历史过程以 Git 提交和明确标注的历史证据为准。

## 快速索引

- [快速开始](./getting-started.md)：安装、登录、启动 Claude Code/Codex 会话。
- [新电脑加入 Server](./add-new-machine.md)：把新电脑或服务器注册为当前账号下的在线设备。
- [项目当前状态](./project-status.md)：当前版本、包名、服务、验证和风险概览。
- [功能与代码映射](./feature-map.md)：用户能力、实现入口和专题文档之间的对应关系。
- [验证覆盖矩阵](./validation-coverage.md)：当前自动化、Web、Android 与未覆盖项。
- [系统架构](./architecture.md)：组件、数据流和信任边界。
- [CLI 架构](./cli.md)：`agenthub` 命令、daemon、远程启动、恢复和诊断。
- [App 架构](./app.md)：Expo/Web/Tauri 客户端、页面、同步层和本地状态。
- [Server 架构](./server.md)：Fastify、Socket.IO、数据库、对象存储和监控。
- [HTTP API](./api.md)：当前服务端 REST 接口分组。
- [实时同步与 RPC](./realtime-sync-and-rpc.md)：Socket.IO 连接类型、事件、RPC 和多进程行为。
- [端到端加密](./encryption.md)：账号、机器、会话、制品和凭据的加密边界。
- [Agents 与 Provider](./agents-and-providers.md)：当前 Claude Code/Codex 支持与历史消息兼容边界。
- [Daemon 与机器](./daemon-and-machines.md)：后台服务、机器注册、远程 spawn/resume。
- [Sandbox](./sandbox.md)：实验性 OS 级沙箱配置与限制。
- [Artifacts、Credentials 与 KV](./artifacts-credentials-kv.md)：制品、托管凭据和用户键值存储。
- [文件传输](./file-transfers.md)：在线机器到 App 的分块下载、续传、本地保存和安全边界。
- [加密外部分享](./external-sharing.md)：选中文本临时分享、客户端加密、撤销和有效期。
- [agenthub-wire](./agenthub-wire.md)：共享 wire schema 与生产协议状态。
- [agenthub-agent](./agenthub-agent.md)：远程控制 CLI 的使用方式。
- [部署](./deployment.md)：生产、standalone、Postgres/Redis/S3/PGlite 配置。
- [本地开发环境](./dev-environments.md)：pnpm workspace、authenticated Web、Android 打包和 daemon 更新。
- [开源发布准备](./open-source-release.md)：公开仓库前的许可证、历史清理、元数据、安全与发布检查。
- [上游同步](./upstream-sync.md)：`slopus/happy` 上游 remote 与移植规则。
- [上游特性审计模板](./upstream-feature-audit-template.md)：评估上游特性时复用。
- [V02 原生 QA 交接](./agenthub-v02-native-qa-handoff.md)：仅用于补 Android arm64 真机和 iOS 证据。
- [贡献指南](./CONTRIBUTING.md)。

## 维护原则

- 代码和自动化测试是事实来源，文档只描述当前已经存在的能力。
- 当前事实文档与历史证据分层：完成后的执行计划不作为当前能力说明，保留内容必须明确标记为历史资料。
- 包级 README 面向使用者；`docs/` 面向工程维护。
- UI/视觉/交互改动以组件、状态机、语义/无障碍、布局边界、协议测试和 production build 为当前验证依据；不新增截图门槛。
