# 开源发布准备

本文用于把当前内部仓库整理并持续同步到公开的
[`dckill/AgentHub`](https://github.com/dckill/AgentHub)。公开仓库使用干净历史，
内部 GitLab 继续保留完整历史；本清单不自动发布 npm 包。

首次公开快照基于内部提交 `0060e522` 及其后的开源规整工作树，发布日期为
2026-07-24。该 SHA 只用于内部与公开版本之间的维护追溯，不代表公开仓库包含旧历史。

## 当前判断

AgentHub 新增贡献的主许可证已经统一为 Apache-2.0；Happy 上游代码继续保留 MIT 许可证和 Happy Coder Contributors 版权通知。README、各发布包元数据、App 使用条款和 NOTICE 已同步许可证边界，并按 Claude Code/Codex 双 Provider 范围收口。

当前仍不应直接把现有完整 Git 历史推送到公开 GitHub。历史中曾跟踪具体服务端 secret，并包含旧 APK、CPU profile、上游二进制和本地索引数据库等大对象。即使当前工作树已删除或忽略，它们仍存在于 Git 对象中。

## 发布策略

优先选择“干净公开快照”：

1. 在内部仓库保留完整历史和审计证据。
2. 从审核后的当前树创建一个不带旧 `.git` 历史的新仓库。
3. 排除 `artifacts/`、本地数据、构建输出、覆盖率、日志和不需要公开的原始性能产物。
4. 以当前 Apache-2.0 `LICENSE`、上游 `LICENSE-MIT`、`NOTICE` 和来源说明作为首次公开提交。
5. 在新仓库记录内部基线 commit SHA，便于维护者追溯，但不要附带内部地址或凭据。

若必须保留提交历史，应先使用专门的 history rewrite 工具移除所有 secret 和大对象，再从全新 clone 复检。历史重写会改变 commit/tag SHA，不应在未备份和未通知协作者的情况下直接对当前内部远端执行。

## 发布前必须完成

- [x] 确定 GitHub owner/repository 为 `dckill/AgentHub`，默认分支为 `main`。
- [x] 创建公开仓库，不推送旧完整历史。
- [ ] 轮换所有曾进入 Git 历史的服务端、Token、存储和签名密钥。
- [x] 更新 root、CLI、Wire、Agent、Server 的 `repository`、`homepage` 和 `bugs` 元数据。
- [x] Issue 使用 `https://github.com/dckill/AgentHub/issues`；安全问题按 `SECURITY.md` 走私密报告。
- [ ] 启用 GitHub Private vulnerability reporting，并实际验证维护者能收到报告。
- [ ] 修复或替换 `https://agenthub.yzsd.asia/support`；当前标准 443 证书不匹配。
- [ ] 确认默认服务端隐私说明、数据保留和删除请求流程。
- [ ] 运行当前依赖、许可证、SBOM、provenance 和 secret 扫描。
- [ ] 检查所有内置二进制归档的来源、校验值、平台范围和第三方许可证。
- [ ] 在干净环境执行安装、类型检查、定向测试、CLI pack/install smoke 和 production build。
- [ ] 验证 GitHub Actions 在最终默认分支上实际触发。
- [ ] 创建首个 GitHub Release，并把 APK、AppImage、CPU profile 等大产物放 Release 或外部归档，而不是普通 Git。

## 建议验证命令

```bash
npx -y pnpm@10.11.0 install --frozen-lockfile
npx -y pnpm@10.11.0 documentation:status
npx -y pnpm@10.11.0 release:doctor
npx -y pnpm@10.11.0 provider-matrix:test
npx -y pnpm@10.11.0 dependency-boundary:test
npx -y pnpm@10.11.0 license:test
npx -y pnpm@10.11.0 check
```

最终发布候选再运行：

```bash
npx -y pnpm@10.11.0 ci:verify
```

涉及 CLI/daemon 构建时，按仓库进程治理规则先记录并安全处理本机 systemd daemon 与 runner，不要为了验证破坏正在运行的会话。

## 不应公开的内容

- `.env*`、token、私钥、签名文件、真实服务端 secret。
- Server 数据目录、数据库/WAL、日志和本机 daemon state。
- 用户消息、绝对路径、机器标识、账号标识和未脱敏诊断。
- `node_modules`、`dist`、coverage、Gradle/Cargo/Expo 缓存。
- 内部 GitLab 地址、runner 配置、未公开 registry/Vault/cluster 细节。
- 不能确认再分发权利的第三方二进制或素材。

## 发布后

- 使用 GitHub Release notes 记录用户可见变化和升级要求。
- 安全修复通过 GitHub Security Advisory 协调。
- 每次发布前复查包元数据、许可证、SBOM、provenance 和默认服务端隐私边界。
- 上游同步继续按 `docs/upstream-sync.md` 执行，并保留原始许可证与版权通知。
