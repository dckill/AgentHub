# 贡献指南

感谢你贡献 AgentHub。当前仓库正在快速演进，贡献时请优先保持改动小、可验证、与现有结构一致。

## 基本流程

1. 从最新主分支创建工作分支。
2. 明确改动范围，只修本次任务相关问题。
3. 根据触及的 package 运行最小测试或类型检查。
4. 更新对应中文文档。
5. 提交 PR 时说明动机、实现、测试结果和已知限制。

## 代码约定

- 不要顺手重构无关文件。
- 不要新增许可证头，除非维护者明确要求。
- 优先修根因，不做只掩盖症状的补丁。
- 新增协议字段时同步更新 `@artsum/agenthub-wire` schema、server、app/CLI 消费方和测试。
- 涉及加密字段时确认服务端不会新增明文敏感内容。

## 文档约定

- `docs/` 使用中文，描述当前实现，不保留过期规划草案。
- 包级 README 可以偏安装和用户介绍；根 `docs/` 偏工程维护。
- 新增重大功能时创建独立文档或补充现有专题。
- 删除功能时同步删除或改写相关文档，不留下“当前支持”的错误描述。
- 如果只是实验包或内部 dev 页面，应明确标注实验边界。

## 测试建议

按改动范围选择：

```bash
pnpm --filter @artsum/agenthub test:unit
pnpm --filter @artsum/agenthub test:integration
pnpm --filter agenthub-server test
pnpm --filter agenthub-app typecheck
pnpm --filter agenthub-agent test
pnpm --filter @artsum/agenthub-wire test
```

涉及 daemon、远程 spawn/resume、Socket.IO 多副本或 sandbox 的改动，应补充手动验证步骤，因为这些能力依赖本机平台、网络和外部代理 CLI。
