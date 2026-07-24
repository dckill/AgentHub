# 验证覆盖矩阵

更新日期：2026-07-18。本文回答当前 AgentHub 1.0 已验证什么、未验证什么、后续修改应如何补验证；审计项关闭状态以 `docs/audits/2026-07-11-hardening-verification-matrix.md` 为准。运行时范围仅含 Claude Code 与 Codex，CI/GitLab 不属于本地强化完成条件。

## 覆盖口径

| 标记 | 含义 |
| --- | --- |
| `AUTO PASS` | 通过单元测试、组件测试、typecheck 或 guardrail 自动验证。 |
| `INT PASS` | 通过本机集成测试，包含真实 server、daemon、agent 或真实上游 CLI/backend。 |
| `WEB PASS` | 历史 authenticated Web 页面证据；仅用于追溯，不是当前新增验证门槛。 |
| `APK PASS` | Android APK 构建和静态校验通过。 |
| `DESKTOP PASS` | 指定桌面平台的production构建、包结构和真实运行边界通过；不自动覆盖其他平台或authenticated旅程。 |
| `PARTIAL` | 有局部验证，但缺少完整端到端证据。 |
| `NOT RUN` | 当前未执行该平台或功能的真实验证。 |

## 当前验证内容

| 范围 | 验证状态 | 已覆盖内容 |
| --- | --- | --- |
| 根级门禁 | `AUTO PASS` | `npx -y pnpm@10.11.0 check`。 |
| Server | `AUTO PASS` | auth service、v3/v4 sync、routes、storage、process image。 |
| CLI / Daemon | `AUTO PASS` + `INT PASS` | 当前 Claude Code/Codex 范围覆盖 Linux stop/timeout/adoption/journal/reconnect/bundle rollback、active turn 收尾、thinking/archive 与失败恢复；证据214当前聚焦回归为 **107 files/709 tests**。旧 Provider 故障矩阵只保留历史证据，不计当前覆盖或阻断。 |
| Agent | `AUTO PASS` | auth、API、history backward pagination、spawn/send/wait。 |
| Wire | `AUTO PASS` | messages、session protocol、v4 sync schema。 |
| Web App | `AUTO PASS` | 证据218最新App统一回归为 **251 files/1452 tests/0 failed/0 skipped**；减少1项是退出范围 Provider 的重复专用测试。production Web export/budget沿用证据214；最近完整coverage/JUnit仍由证据208记录为1451/0/0及S/L36.53%、B77.73%、F46.02%。Evidence176固化的非下降阈值仍为S/L36.53%、B77.63%、F45.17%，不因单次上升自动放宽。CI已退出目标。 |
| Android App | `APK PASS` + `RUNNER READY` | arm64-only production APK，包名 `com.artsum.agenthub`；证据174将设备门禁改为前台Activity、UIAutomator语义、ABI及ANR/FATAL日志自动化，不再要求截图。 |
| iOS App | `RUNNER READY / NOT RUN` | 证据174已移除dev视觉路由和截图步骤，保留app/bundle、install/launch/log及同设备八项安全自动化；当前Linux无macOS runner。 |
| Tauri Desktop | `DESKTOP PASS`（Linux当前源码）+ `MANUAL OPEN` | 证据172–173：production制品、Secret Service真实write/read/delete、TDD **3 files/14 tests**；当前App全量以证据218的251 files/1452为准，最近coverage观测沿用证据208的B77.73%/F46.02%。Linux authenticated credential lifecycle已关闭；macOS/Windows签名/公证/更新回滚转入非阻塞验收表。 |
| 生产部署 | `PARTIAL` | 本地Kubernetes三副本10/10、45 migrations、压力/滚动/pod-kill和640.4MB Server runtime已验证；context不含嵌套env/data/log，生产依赖offline frozen重建，默认CMD为编译Node20 ESM且无TSX/source tree。证据154–156完成Server/Web digest renderer、CEL准入和非root Redis/Web及本地签名发布回滚。真实protected GitLab OIDC、生产registry/Vault/cluster及外部生产Postgres/Redis/S3仍未验收。 |
| GitLab protected release evidence（目标外） | `HISTORICAL` | 证据177–186保留采集器实现和当时测试事实；远程 GitLab/OIDC/artifact 已退出本地强化目标，不影响当前完成状态。 |

## 默认验证流程

后续采用“集中实现 → TDD定向门禁 → 类型检查/必要构建 → 阶段完整自动化回归”。不再新增浏览器、截图、录屏、人工点击或其他图形化验收；历史图形证据仅保留为历史记录。

当前状态文档另由 `pnpm documentation:status:test` 与 `pnpm documentation:status` 失败关闭：五份权威状态/计划文档必须共同引用证据218的1452测试及证据208的B77.73%/F46.02%最近coverage观测，并把Evidence176的非下降阈值与当前值明确分开；总计划不得重新出现未勾选实现项，历史矩阵不得重新冒充当前快照，已关闭的许可证阻断也不得回漂。

发布元数据检查覆盖开发/发布 skill 与隐私联系入口：拒绝 TeamCity、GitHub Release/Pages、`main`、旧 `asia.yzsd.agenthub*` 包名和上游 issue tracker；开发 skill 必须明确远程 CI 不属于本地强化完成条件，release skill 仍须保留真实 GitLab/master、自托管文档与发布治理。当前三环境包名和 AgentHub support 必须一致。

## 未验证项

| 未验证项 | 原因 | 后续方式 |
| --- | --- | --- |
| iOS 真机或 simulator | 当前 Linux 工作机无 Xcode；用户暂不需要 iOS。 | macOS 上运行 `agenthub:native:ios`，并按 `docs/agenthub-v02-native-qa-handoff.md` 交证据。 |
| Android arm64设备runner | 证据171已完成当前源码production arm64 APK构建和静态验证，但ADB当前0设备。 | 连接arm64设备后执行自动化Native契约；不要求人工截图。 |
| 跨平台桌面发布 | 证据172–173已关闭Linux production制品、Secret Service和authenticated credential lifecycle；没有macOS/Windows runner及平台签名材料。 | 在protected macOS/Windows release runners执行自动化打包、签名/公证、安装、升级与回滚矩阵。 |
| 真机 push 投递 | 需要 APNs/FCM token、真机权限和服务端推送配置。 | 原生 App 登录注册 token 后，用 `agenthub notify` 验证。 |
| 生产多副本 | 需要外部 Postgres、Redis、对象存储和反代。 | 按 `docs/deployment.md` 单独建生产等价环境。 |
| 当前 Provider 矩阵 | 产品仅支持 Codex 与 Claude Code；两者本机自动化与可用真实故障路径继续保留。Gemini、OpenClaw、OpenCode、通用ACP已退出范围，其历史测试和缺口不再计入覆盖率或发布阻断。 | 范围裁剪与定向回归已完成；外部平台差异列入用户验收表。 |
| Native lifecycle timeout/辅助技术 | Web终态和App时序单测已通过，但本机没有完整设备runner证据。 | Android/iOS QA runner断言timeout、中间态、accessibility tree名称和状态；不要求人工听测或截图。 |
| Provider transport / 许可证 / 安装完整性 | 当前 Claude Code/Codex 生产依赖与许可证边界已自动验证；证据193–195中的其他 Provider 工具链仅是历史事实。 | 不得重新引入退出范围 Provider、全局浮动安装、专有SDK或放宽门禁。 |

## 当前结论

本地主开发的 **Phase 4 与 Final Verification Gate 已完成**。2026-07-18 起仅保留 Claude Code 与 Codex，CI/GitLab及退出范围 Provider 不再是目标完成条件；macOS/Windows、Native真机、推送、证书及生产基础设施写入用户验收表，不阻塞本地完成。

## 历史 Evidence 日志

以下段落保留证据生成时的工具链、Provider 和 CI 状态，仅供追溯，不覆盖上方当前范围与完成结论。

Evidence 175 已把 required Web 验证迁为无浏览器契约门禁：CI 拓扑 **3/3**、App 契约 **10 files/54 tests**、JUnit **54/0**，最终根 `ci:verify` exit 0；直接 Playwright 依赖与独立 authenticated browser runner 已移除。后续本地验证不再新增浏览器、截图或人工点击，protected GitLab 首次真实执行仍作为外部证据保留。

Evidence 188 已把GitLab依赖缓存按`CI_COMMIT_REF_PROTECTED`分区并设置`unprotect:false`：专项 **7/8 RED→8/8 GREEN**，完整`ci:verify` exit 0。该门禁覆盖非受保护MR到受保护master/schedule的缓存信任边界；首次真实protected runner的cache key/命中行为仍需外部流水线artifact确认。

Evidence 189 已把pnpm工具链从“仅固定版本”提升为“版本+发布归档SHA-512”：策略 **8/9 RED→9/9 GREEN**，release metadata合计定向 **15/15**；固定digest Node20容器真实Corepack smoke、Docker/K8s **29/29**和完整`ci:verify`均exit 0。首次protected GitLab和完整Docker image build仍需外部artifact确认。

Evidence 190 将local Kubernetes overlay全部第三方工作负载镜像固定为版本+multiarch digest，并把Server canonical manifest迁入`deploy/base`，使默认Kustomize load restrictor可用。策略 **19/20 RED→21/21 GREEN**，release/Docker聚合定向 **51/51**，kubectl v1.35.1默认渲染exit 0，完整`ci:verify`及Docker/K8s **31/31**。fresh local cluster apply/smoke仍作为后续环境证据。

Evidence 191 已关闭上述fresh local cluster缺口：隔离Minikube真实apply、45/45 migrations、Server 3/3与Postgres/Redis/MinIO/Prometheus/Grafana Ready、health 200、远程运行时digest 7/7。冷启动抢跑依赖以 **21/22 RED** 捕获，安全init gate后定向 **4 files/52**、真实3副本restart 0/0/0；完整`ci:verify` exit0、Docker/K8s **32/32**。本地覆盖升级为`PASS`；protected生产OIDC/registry/Vault/cluster和跨平台/Native外部证据不变。

Evidence 192 刷新当前可用Provider与环境隔离覆盖：Codex/Claude/ACP idle+active真实child故障恢复 **6/6、exit0**，环境策略 **28/28**，authenticated私有CLI构建前后共享dist快照一致；没有浏览器或截图，私有环境/进程已清理，生产daemon不变量保持。本地已安装后端子矩阵为`PASS`；Gemini有效凭据、live OpenClaw、protected retained artifact及macOS/Windows仍为`EXTERNAL`。

Evidence 193 将Claude执行边界改为独立安装的固定版本Claude Code stream-json transport，并移除专有SDK生产依赖。直接license门禁缺`--prod`先以1827包/2 unresolved失败，固定生产口径后transport **4/4**、真实active SIGKILL **1/1**、CLI **777/777**、Codium **92/92**、license **5/5**、供应链 **11/11**、生产1549包unresolved 0及完整`ci:verify`均通过；未使用浏览器或截图。该许可证子项为`AUTO PASS`，外部Provider/protected/cross-platform门槛不变。

Evidence 194 进一步关闭protected Provider安装完整性：41个package/platform坐标全部SHA-512，固定Node22 digest并仅允许4个锁定构建脚本；主机与不可变容器的Codex 0.144.1、Claude 2.1.207、OpenCode 1.17.18、Gemini 0.50.0均通过。定向18/18、供应链12/12和完整`ci:verify` exit0；无图形化验证。真实凭据和retained schedule artifact仍为`EXTERNAL`。

Evidence 195 补齐非workspace Provider lock的扫描盲区：独立audit为37依赖/全严重度0且只读阈值校验不再覆写输入，reachable high/critical 0、固定digest OSV 0、CycloneDX 41组件；双SBOM共同进入provenance并分别具备Sigstore门禁。Provider许可证保留Unknown7/MIT7/Apache-2.0 2原始artifact，明确它们是外部工具而非随产品发布的许可证放行。定向23/23、完整`ci:verify` 103 node:test + 147 Vitest assertions、exit0；真实protected GitLab bundle/artifact仍为`EXTERNAL`。

Evidence 196 将Server生产镜像从835.6MB进一步降至640.6MB，并把嵌套env、本地data/WAL、日志排除出844.88kB context；production dependency重建为336包且offline downloaded=0。PGlite patch hardlink隔离3/3、Docker/K8s34/34、release metadata7/7、45 migrations/health、audit2265全0、OSV0、SBOM2229、license1516/0 unresolved及完整`ci:verify`均为`AUTO PASS`。protected registry/Vault/cluster/OIDC仍为`EXTERNAL`。

Evidence 197 关闭Server生产动态转译边界：compiled runtime1/1、依赖边界11/11、Docker/metadata19/19；PGlite和PostgreSQL各45 migrations/health200，默认CMD与两容器SIGTERM exit0。Server39 files/145 passed、1 file/2 Redis external skipped；runtime无sources/TSX/TypeScript/Vitest，完整CI、audit2265全0、reachable/OSV0、SBOM2229、license1516/0 unresolved均`AUTO PASS`。独立migration image为后续P2，protected发布仍`EXTERNAL`。

Evidence 198 关闭在线Server最小依赖与本地migration拆分边界：runtime manifest1/1、依赖边界12/12、Docker/签名/供应链39/39；在线镜像370.3MB且无Prisma CLI/schema/构建测试工具，独立migration镜像完成PostgreSQL45/45，PGlite/PostgreSQL health200/SIGTERM0。Server145 passed/2 Redis external skipped，完整CI exit0；根/runtime audit依赖2265/174全0、reachable/OSV0、SBOM2229/175、许可证1516 resolved/runtime168 inventory均`AUTO PASS`。生产exact-digest migration Job编排和protected执行为`EXTERNAL`。

Evidence 199 将生产migration Job源码编排转为`AUTO PASS`：RED34/40→GREEN72/72；双digest验签、Job hardened/admission、secrets readiness、Complete-before-Deployment、失败日志/删除/零Deployment mutation均有契约。固定kubectl渲染base7/local19文档，完整CI exit0（Docker/K8s36、release17）。真实protected manual deploy、OIDC/Vault/registry/cluster artifact仍为`EXTERNAL`。
