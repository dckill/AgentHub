# 项目当前状态

更新日期：2026-07-24。

## 总体结论

AgentHub 当前运行时只支持 Claude Code 与 Codex，覆盖 CLI/daemon、Expo App、Web、Tauri Desktop、Server、共享 Wire 协议和独立远程控制 Agent。Gemini、OpenClaw、OpenCode 与通用 ACP Provider 已退出产品范围；历史消息只保留无创建入口的通用只读兼容。

本地核心功能和工程门禁已经完成一个阶段性收口，公开仓库确定为
[`dckill/AgentHub`](https://github.com/dckill/AgentHub)。现有内部 GitLab 完整历史不直接公开；
GitHub 使用审核后的干净历史。正式发布后仍需启用并验证私有漏洞报告，同时轮换曾进入内部历史的密钥。

## 包与入口

| 组件 | 当前状态 |
| --- | --- |
| CLI | `@artsum/agenthub`，版本 `1.1.4`，bin 为 `agenthub` / `agenthub-mcp`，默认服务端 `https://agenthub.yzsd.asia:8443`。 |
| App | `agenthub-app`，版本 `1.0.0`，`runtimeVersion=1`，Android production 包名 `com.artsum.agenthub`。 |
| Server | Fastify 5 + Socket.IO + Prisma；支持 standalone PGlite/本地文件和外部 Postgres/Redis/S3。 |
| Wire | `@artsum/agenthub-wire`，共享 Zod schema 与 TypeScript 协议类型。 |
| Agent | `agenthub-agent`，支持登录、列机器/会话、spawn、send、history、wait 和 stop；尚未发布到 npm。 |
| App Logs | 仅供本地开发调试的日志接收服务。 |
| Codium | 独立 Electron 实验包，不属于主 App 发布面。 |

## 当前验证基线

- 根级依赖边界、生成物跟踪规则与协议 guardrail 有自动化测试。
- Evidence 218 的 App 基线为 **251 files / 1452 tests**；Evidence 208 记录的最近完整 coverage 观测为 Branches **77.73%**、Functions **46.02%**。
- CLI、Server、Wire、Agent 与 Codium 均有包级测试和类型检查入口。
- Web/UI 改动使用组件、状态机、语义/无障碍、布局边界、协议测试和 production build 验证，不再以截图或人工点击作为默认门槛。
- Android production arm64 通过脚本输出到根目录 `artifacts/`；真机、iOS、macOS/Windows 签名公证和生产基础设施属于人工验收范围。
- 发布元数据检查必须通过 `pnpm release:doctor`；完整本地门禁为 `pnpm ci:verify`。

详细覆盖见 [验证覆盖矩阵](validation-coverage.md) 和 [验证矩阵](verification-matrix.md)。历史强化过程与截图证据只用于追溯，不覆盖本页结论。

## 文档与代码一致性

当前文档分三层：

1. `README.md`、本页和 `docs/` 专题文档描述当前实现。
2. `docs/audits/`、`docs/validation/` 记录历史验证与审计证据。
3. `docs/plans/`、`docs/superpowers/` 是历史设计/执行资料，不作为当前功能承诺。

包级 README 必须与当前发布包一致。新增或删除命令、Provider、环境变量、API、数据处理或发布入口时，必须同步更新对应专题文档和自动化门禁。

## 已知发布阻断

| 级别 | 阻断项 | 处理方式 |
| --- | --- | --- |
| 必须 | 旧 Git 历史曾跟踪具体服务端 secret，且包含 APK、CPU profile 和旧上游二进制等大对象。 | 不直接把现有全部历史推到公开仓库；先轮换相关密钥，并选择审核后的 history rewrite 或干净快照。 |
| 已完成 | GitHub owner/repository 与包元数据。 | 公开仓库为 `dckill/AgentHub`，默认分支 `main`；root、CLI、Wire、Agent、Server 均指向该仓库。 |
| 必须 | GitHub Private vulnerability reporting 尚未启用。 | 按 `SECURITY.md` 启用并验证私密报告入口。 |
| 必须 | 现有 `https://agenthub.yzsd.asia/support` 在标准 443 上证书不匹配。 | 修复证书和支持入口，或改用最终 GitHub/受控邮箱。 |
| 建议 | 历史证据目录约 69MB，CLI 内置跨平台工具归档约 95MB。 | 新公开仓库使用干净快照；原始性能产物和安装包后续放 Release/外部归档，仓库仅保留摘要与许可证。 |
| 建议 | GitHub Actions 只提供基础 smoke/typecheck，不等价于当前 GitLab 发布门禁。 | 公开后先验证基础工作流，再决定哪些发布门禁迁移到 GitHub。 |

完整步骤见 [开源发布准备](open-source-release.md)。

## 长期约束

- 生产 daemon 由 `agenthub-daemon.service` 管理，service 必须使用 `KillMode=process`。
- daemon/runner 在 SIGTERM、SIGINT、归档和异常退出时必须补齐 active turn 的 `turn-end` 并关闭 thinking。
- Android APK 统一输出到根目录 `artifacts/`，不得把 Gradle 内部目录当成交付位置。
- 修改协议字段时同步更新 Wire schema、Server 与各客户端消费方及测试。
- 不提交 `.env`、服务端数据目录、日志、覆盖率、构建产物、用户内容或真实凭据。
