# 五项治理整改边界与完成标准

更新日期：2026-08-12。

本轮只治理现有 AgentHub 产品的结构与工程可信度，不新增用户功能，不改变 Wire、HTTP、Socket.IO、CLI RPC 或数据加密协议。运行时产品范围固定为 Claude Code 与 Codex。

## 核心模块边界

整改对象是当前仍承担多类职责的生产文件，而不是对全仓库按行数做机械切割：

| 文件 | 保留职责 | 必须迁出的职责 | 完成上限 |
| --- | --- | --- | --- |
| App `sync.ts` | 账户级同步编排与依赖接线 | 具体请求、解析、投影和生命周期算法 | 1,320 行 |
| App `storage.ts` | store facade 与持久化接线 | hooks、类型、投影和缓存算法 | 1,320 行 |
| App `reducer.ts` | reducer 分发 | 阶段说明和可独立转换规则 | 1,210 行 |
| App `ops.ts` | 用户操作 facade | Provider/工作树/文件操作实现 | 1,000 行 |
| App 新建会话页 `new/index.tsx` | 单一页面控制器与语义结构 | 样式系统和可复用派生规则 | 1,800 行 |
| CLI `runCodex.ts` | runner 顶层生命周期 | prompt/hash、signal、turn、消息投影和恢复算法 | 1,250 行 |
| CLI `codexAppServerClient.ts` | transport facade | 能力探测、握手、通知、审批和 thread 操作算法 | 870 行 |
| App `AgentInput.tsx` | 输入区组合 | 设置、附件、上下文和动作栏实现 | 700 行 |

拆分必须保持公开接口和行为；每个迁出边界先有失败测试，完成后通过定向测试、包级全量回归和类型检查。新抽取的生产模块不得超过 1,000 行；保留 facade 超过 700 行时必须只有一种可命名职责。以上上限以本轮实际完成的职责切口为基线，后续只能下降、不得上调。

## 覆盖率观测边界

本轮覆盖观测以 `agenthub-app` 全部生产 TypeScript/TSX 为统计域，排除测试、声明、生成文件、开发菜单和测试辅助代码。每次刷新必须同时记录测试文件数、测试项数、statements、lines、branches、functions、日期和命令。

完成标准：提交可机器读取的当前基线；`test:coverage` 生成 JSON summary 后自动校验；四项指标启用非下降门禁；测试清单改变但基线未更新时失败。其他包继续执行包级全量测试，本轮不把不同运行时的覆盖率强行合并成一个失真的总百分比。

## 状态文档边界

当前事实只在 `docs/project-status.md`、`docs/validation-coverage.md` 和 `docs/verification-matrix.md` 三份文档维护；审计和计划文档保留历史叙事，不再要求同步改写历史快照。

完成标准：状态门禁从代码清单、CLI manifest、覆盖基线和审计当前统计动态取值，不再硬编码旧 Evidence 编号；三份当前文档必须一致引用最新 CLI 版本、App 测试清单、覆盖率和活跃审计数；任一处漂移即失败。

## 桌面产品边界

桌面正式产品只有 Expo Web/Tauri，共用 `agenthub-app` 的功能、设计系统、认证和发布链路。独立 Electron 实验包退出 workspace、根命令、依赖策略和当前产品文档；历史审计证据保留原文用于追溯。

完成标准：workspace 和根清单只包含正式包；当前文档不存在第二套桌面入口；锁文件不存在已退出包 importer；供应链门禁不再构建或检查已退出包。

## 历史数据模型边界

只清理同时满足以下条件的模型：生产代码零读写、当前 Claude Code/Codex 产品无业务语义、没有只读兼容要求。已确认候选为好友关系、用户 Feed 和语音会话三组历史模型。

Prisma schema、Account 反向关系和相关枚举必须同步删除；旧迁移保持不可变并新增前向迁移。前向迁移采用有数据即中止策略：发现任一历史表存在记录时拒绝删表，要求先导出或制定保留方案，禁止静默丢失生产数据。

完成标准：schema 不再生成这些模型的 client API；前向迁移能在空表/无表两种状态执行；存在数据时 fail-closed；Server build、迁移契约测试和相关全量测试通过。

## 整体完成定义

五项必须全部满足各自完成标准，且根类型检查、受影响包全量测试、Server build、App production build、文档门禁和 GitNexus 变更影响检查通过，才能把本轮目标标记完成。外部 CI、真机、商店签名和生产部署不属于本轮源码治理的完成条件。
