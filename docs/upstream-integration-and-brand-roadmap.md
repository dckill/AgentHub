# 上游集成与 AgentHub 品牌维护准则

本文保留长期有效的上游同步和品牌边界。AgentHub 1.0 的一次性品牌、命名、UI、daemon、Android 包名改造已经完成，历史执行计划不再保留在文档树中。

## 当前基线

- 产品名：`AgentHub`。
- 默认服务端：`https://agenthub.yzsd.asia:8443`。
- CLI 命令：`agenthub`，发布包 `@artsum/agenthub`。
- Runtime 环境变量：`AGENTHUB_*`。
- 本机数据目录：`~/.agenthub`。
- Linux 服务：`agenthub-server.service`、`agenthub-daemon.service`。
- Android production：`com.artsum.agenthub`。
- App 版本：`1.0.0`，`runtimeVersion=1`。
- 设计事实源：`design/Design.md`。
- 历史 Web 截图：`docs/assets/agenthub-1.0/` 与 `docs/audits/evidence/`；当前不再新增图形化验证。

## 上游定位

上游 `slopus/happy` 只作为特性素材库，不作为直接 merge 基线。每个上游能力都应在独立分支中审计、手工移植、测试和记录，再合入稳定主线。

禁止直接执行：

```bash
git merge upstream/main
```

允许方式：

- `git show <sha>` 后手工移植。
- `git cherry-pick -n <sha>` 作为临时取 diff 手段，提交前必须审查和改写。
- 按协议/数据结构、CLI/Server、App 展示、UI 入口拆小提交。

## 长期边界

当前用户明确要求不保留旧 Happy/Handy 运行兼容。因此以下内容不得回退：

| 范围 | 当前要求 |
| --- | --- |
| 用户可见品牌 | 只使用 AgentHub。 |
| Runtime env | 使用 `AGENTHUB_*`，不新增 `HAPPY_*` 或 `HANDY_*` fallback。 |
| 服务名 | 使用 `agenthub-daemon.service`、`agenthub-server.service`。 |
| 数据目录 | 默认 `~/.agenthub`。 |
| URL scheme | `agenthub://`。 |
| Android production 包名 | `com.artsum.agenthub`。 |
| APK 命名 | `agenthub-production-arm64-YYYYMMDD-HHMM.apk`。 |

仍可保留的内部稳定边界：

- 数据库字段和 wire schema 字段，除非有明确迁移计划。
- 经过测试覆盖的 RPC method 名称，除非客户端/daemon/server 同步迁移。
- 上游特性移植时有助于降低冲突的文件结构和抽象边界。

## 上游特性优先级

| 优先级 | 类型 | 示例 |
| --- | --- | --- |
| P0 | 数据丢失、安全、权限、路径穿越、shell 注入 | 加密、文件读写、RPC 权限、认证流程。 |
| P1 | 会话卡死、daemon 生命周期、Socket.IO 重连、消息重复 | runner cleanup、turn-end、presence、v4 sync。 |
| P2 | 长会话、性能、资源占用 | 分页、并行解密、列表虚拟化、缓存边界。 |
| P3 | 局部 UI polish 或工具展示模式 | diff、Git、文件、命令菜单和状态 chip。 |

## 移植完成标准

每个上游移植分支结束前必须留下：

- 变更摘要。
- 引入或参考的上游提交列表。
- 本地适配说明。
- 自动化测试命令和结果。
- 自动化组件、语义/无障碍、状态机、布局边界或 production build 证据。
- 无法自动验证的功能与原因。

## 品牌和 UI 回归规则

新增 UI 必须复用 AgentHub Amber Crystal token 和基础组件。不要新增硬编码大面积黄色、纯黑无层次背景、透明度过高的浮层或旧 Happy 文案。

UI 改动默认验证流程：

```bash
npx -y pnpm@10.11.0 web:contract:test
npx -y pnpm@10.11.0 --filter agenthub-app typecheck
```

按组件测试、语义/无障碍断言、状态机、布局边界和 production build 验证。原生能力通过自动化 Native 契约验证；无法在本机执行的项目进入人工验收表，不阻塞本地功能完成。

## V02 原生证据

`docs/agenthub-v02-native-qa-handoff.md` 只保留给外部 Android arm64 真机和 iOS 设备补证据。当前用户不要求 iOS 测试，因此 iOS 缺口不阻塞 Android/Server/CLI 的正式本机部署。

V02 要标记完成时，必须满足 strict evidence：

```bash
npx -y pnpm@10.11.0 --filter agenthub-app agenthub:native:evidence
```

只有 `readyToMarkV02Done: true` 且 completion criteria 全部通过，才能更新 `design/Design.md`、`docs/project-status.md` 和 `docs/validation-coverage.md` 中的原生验证状态。
