# 上游同步

AgentHub 基于 [slopus/happy](https://github.com/slopus/happy) 演进。当前代码已经形成独立产品边界，上游只作为特性与修复来源，不作为可直接合并的发布基线。

## Remote 约定

| 名称 | 用途 |
| --- | --- |
| `origin` | 当前维护仓库；地址由每个 clone 自行配置，不写入公开文档。 |
| `upstream` | `https://github.com/slopus/happy.git`。 |

检查并配置：

```bash
git remote -v
git remote add upstream https://github.com/slopus/happy.git
git fetch upstream main
```

如果 `upstream` 已存在但地址不正确，先确认没有依赖旧地址的自动化，再显式修改。

## 分支角色

| 分支 | 规则 |
| --- | --- |
| `master` | AgentHub 当前稳定主线。 |
| `vendor/upstream-main` | `upstream/main` 的只读镜像，不在其上解决产品冲突。 |
| `sync/upstream-main` | 只用于一次性冲突研究，不作为默认集成路径。 |

更新只读镜像：

```bash
git fetch upstream main
git update-ref refs/heads/vendor/upstream-main refs/remotes/upstream/main
```

是否把镜像分支推送到 `origin` 取决于维护仓库策略；公开仓库没有必要暴露内部同步分支。

## 移植规则

不要直接把 `upstream/main` merge 到 `master`。优先按单个特性或修复审计：

1. 使用 `git show <upstream-sha>` 阅读原始改动。
2. 在独立分支和 worktree 中手工移植，或用 `git cherry-pick -n` 仅获取 diff。
3. 保持 AgentHub 品牌、Claude Code/Codex 双 Provider、协议兼容和 daemon 生命周期约束。
4. 运行与改动范围匹配的定向测试、类型检查和必要构建。
5. 在提交或 PR 中记录上游 commit、许可来源、本地适配和验证结果。

详细优先级和完成标准见 [上游集成与品牌维护准则](./upstream-integration-and-brand-roadmap.md)，评估模板见 [上游特性审计模板](./upstream-feature-audit-template.md)。
