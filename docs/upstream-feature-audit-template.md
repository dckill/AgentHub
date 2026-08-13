# 上游特性审计模板

本文是后续审计 `upstream/main` 相对本地 `master` 的固定模板。每次上游更新后，先复制本文结构生成当日审计，再决定是否进入移植分支。

## 1. 基线信息

记录命令：

```bash
git fetch upstream main --tags
git fetch origin --prune
git rev-parse --short master upstream/main vendor/upstream-main origin/master
git rev-list --left-right --count master...upstream/main
git merge-base master upstream/main
```

填写：

| 项 | 值 |
| --- | --- |
| 审计日期 |  |
| 本地 `master` |  |
| `origin/master` |  |
| `upstream/main` |  |
| `vendor/upstream-main` |  |
| merge-base |  |
| 本地独有提交数 |  |
| 上游独有提交数 |  |
| 双方重叠改动文件数 |  |

## 2. 文件重叠风险

生成命令：

```bash
base=$(git merge-base master upstream/main)
comm -12 \
  <(git diff --name-only "$base"..master | sort) \
  <(git diff --name-only "$base"..upstream/main | sort)
```

按模块归类：

| 模块 | 重叠文件数 | 风险判断 | 说明 |
| --- | --- | --- | --- |
| `packages/agenthub-app/sources` |  |  |  |
| `packages/agenthub-cli/src` |  |  |  |
| `packages/agenthub-server/sources` |  |  |  |
| `packages/agenthub-wire/src` |  |  |  |
| 文档/脚本/依赖 |  |  |  |

## 3. 候选特性列表

| 编号 | 上游特性 | 代表提交 | 价值 | 风险 | 建议 |
| --- | --- | --- | --- | --- | --- |
| F01 | Agent Goal 权威状态支持 | `d9c0c734` | 高 | 中高 | 手工移植，先 CLI/数据结构，后 App 展示。 |
| F02 | Codex/Claude 图片附件能力 | `645b5aa5` | 高 | 高 | 先做 spike，不直接合主线。 |
| F03 | 长会话懒加载、分页、并行解密 | `1ddd6eef` | 高 | 中 | 手工移植 storage/sync 思路并补测试。 |
| F04 | Codex permission-mode / full-yolo | `812f4e1b` | 中高 | 中 | 小批次移植，优先拿测试和映射规则。 |
| F05 | Opus 4.8、dynamic workflows、xhigh effort、Zod 4 | `a8a4008d`、`004338ca`、`f8d43d9f` | 中高 | 中 | 单独依赖/模型兼容分支。 |
| F06 | Session fork / duplicate / rewind | `397136b3` | 高 | 高 | 第一批后段移植，必须拆协议、CLI、App。 |
| F07 | Cleaner commands / Codex skills 菜单 | `5c804c8a` | 中高 | 中高 | CLI 发现逻辑和 App 展示规则拆开。 |
| F08 | Desktop UI overhaul / sidebar / file editor / all-files diff | `c4b13d90` | 中高 | 很高 | 不整体合并，只挑局部设计。 |
| F09 | 新建会话配置移动到 sidebar | `8ed622b2` | 中 | 高 | 暂缓，只参考布局工具函数。 |
| F10 | Self-host server CLI 与 server 包拆分 | `5981a899`、`d2d2f730` | 中高 | 中高 | 按部署需求单独评估。 |
| F11 | Smart push routing / active device / web tab title | `0c58ea71`、`2db77937` | 中 | 中高 | 推送专项时处理。 |
| F13 | Tauri 桌面兼容与签名配置 | `8e4118b0`、`4a64c66a` | 中 | 低中 | 小批次 cherry-pick。 |
| F14 | agents/sessions 技能与开发文档 | `0bfb7041`、`17937dd1` | 低中 | 低 | 手工合并，不覆盖项目约定。 |

## 4. bugfix 与范式池

| 类型 | 上游提交 | 本地价值 | 是否纳入 |
| --- | --- | --- | --- |
| 数据/同步修复 |  |  |  |
| daemon/CLI 稳定性 |  |  |  |
| Server/API 稳定性 |  |  |  |
| 依赖/构建兼容 |  |  |  |
| UI 小修 |  |  |  |
| 测试模式改进 |  |  |  |

## 5. 每项候选的审计详情

每个候选特性使用相同结构：

```markdown
### FXX 特性名称

- 代表提交：
- 涉及模块：
- 本地已有相关实现：
- 直接 cherry-pick 风险：
- 建议移植策略：
- 需要新增或复用的测试：
- 需要浏览器或真机验证：
- 决策：纳入第一批 / 第二批 / 暂缓 / 放弃
```

## 6. 审计完成后的输出

每次审计结束必须给出：

- 推荐进入本轮移植的特性列表。
- 明确暂缓的 UI 或大规模重构。
- bugfix 和范式池。
- 当前无法判断的项及需要补充的信息。
- 下一条建议创建的分支名。
