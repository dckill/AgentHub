# Verification Matrix

Updated: 2026-07-18. Phase and closure status is authoritative only in `docs/audits/2026-07-11-hardening-verification-matrix.md`; this file is the compact developer command and historical evidence index. Current runtime supports only Claude Code and Codex. CI/GitLab rows are retained release/history references, not local hardening completion conditions.

## Environment

| Item | Value |
| --- | --- |
| Git checkout | `master` |
| Package manager | `pnpm@10.11.0` via `npx -y pnpm@10.11.0` |
| Default server | `https://agenthub.yzsd.asia:8443` |
| App version | `1.0.0`, `runtimeVersion=1` |
| Android production package | `com.artsum.agenthub` |

## Command Matrix

| Area | Command | Status | Notes |
| --- | --- | --- | --- |
| Workspace check | `npx -y pnpm@10.11.0 check` | PASS | diff check、递归 typecheck 和 guardrail tests 通过。 |
| Current documentation status | `npx -y pnpm@10.11.0 documentation:status:test && npx -y pnpm@10.11.0 documentation:status` | PASS | 证据218：五份权威状态/计划文档共同引用当前1452测试及证据208的B77.73%/F46.02%最近coverage观测，区分Evidence176非下降阈值，并拒绝未勾选实现项、旧矩阵冒充当前及已关闭许可证阻断回漂。 |
| Operational/release documentation metadata | `npx -y pnpm@10.11.0 exec vitest run scripts/releaseMetadata.test.ts && npx -y pnpm@10.11.0 metadata:check -- --json` | PASS | dev skill 固化三环境包名、双 Provider 与“远程 CI 目标外”；release skill 仍校验 GitLab/master、自托管 docs 和真实发布治理；同时拒绝旧 TeamCity/GitHub/main/bundle/contact 漂移。 |
| Server targeted tests | `npx -y pnpm@10.11.0 --filter agenthub-server test` | PASS | 覆盖 auth、v3/v4 sync、routes、storage 等。 |
| CLI targeted tests | `npx -y pnpm@10.11.0 --filter @artsum/agenthub test:unit` | PASS | 覆盖配置、daemon、runner、Codex/Claude mapper、QR auth。 |
| CLI plan-mode integration | `pnpm --filter @artsum/agenthub test:integration` | PASS（本地接线） | Claude Code/Codex 当前范围保留 plan-mode 集成；远程 protected job 属于目标外发布运维，不影响本地完成。 |
| Browser-free Web contract | `pnpm web:contract:test --reporter=default --reporter=junit --outputFile.junit=../../reports/web-contract/junit.xml` | PASS（本地契约） | 证据175：required入口自检CI拓扑 **3/3**，再执行root-secret内存、认证/账号切换、生产路由、初始化恢复、无障碍、App Links与Web payload共 **10 files/54 tests**；JUnit **54/0**、0600。直接Playwright依赖和standalone browser runner已移除；最终`ci:verify` exit0。首次protected GitLab retained artifact仍开放。证据162–167仅保留为历史真实Web记录，不再是后续required流程。 |
| Agent tests | `npx -y pnpm@10.11.0 --filter agenthub-agent test` | PASS | 覆盖 auth、API、history pagination、spawn/send/wait。 |
| Wire tests | `npx -y pnpm@10.11.0 --filter @artsum/agenthub-wire test` | PASS | messages、sessionProtocol、v4Sync schema。 |
| App targeted tests | `npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run ...` | PASS | 覆盖品牌 manifest、主题、菜单、i18n、native QA evidence、UI 辅助逻辑。 |
| App full tests/coverage/JUnit/typecheck | `npx -y pnpm@10.11.0 --filter agenthub-app exec vitest run` + root `check` | PASS | 证据218当前源码：**251 files/1452 tests/0 failed/0 skipped**；减少1项是退出范围 Provider 的重复专用测试。最近完整coverage/JUnit由证据208记录为1451/0/0及S/L **36.53%**、B **77.73%**、F **46.02%**。Evidence176非下降阈值保持不变；CI不再属于目标。 |
| Web performance profile | production export + cache-disabled cold/cache-enabled hot Chromium + authenticated 10k E2EE fixture + `pnpm app:perf:baseline -- --runs=5` | PASS（Linux/Web边界） | 证据157–158/165：最新66 files/11,443,014 bytes，bootstrap **976,871/1,551,892 gzip**；favicon仅1个稳定请求。固定Linux/Node/V8五轮10k replacement p50/p95中位数 **0.230/0.508ms**、每轮p95改善至少91.4%；50×10k最大GC稳定加载heap增量128,925,472 bytes、回收59.5%–59.6%。100页store提交100→10；authenticated live chase dev峰值 **475,033,024→307,694,675 bytes（-35.2%）**。Native/release-authenticated profile仍开放。 |
| Phase 1 daemon/provider | Claude Code/Codex daemon integration | PASS（Linux 本机边界） | 当前范围覆盖 stop/timeout、fatal、turn-end、thinking、archive、adoption/journal/reconnect 与 bundle rollback；证据94/168中的其他 Provider 结果仅作为历史记录。 |
| CLI registry release drill | `npx -y pnpm@10.11.0 cli-registry-release-drill:test` | PASS（隔离本地registry） | 证据156当前工作树9/9：真实pnpm baseline发布/干净安装→1.0.3升级→dist-tag回滚/同consumer降级；默认与scoped registry统一走回环固定上游代理，metadata中的同源tarball URL重写回代理且本地token不外传。真实旅程连续3轮12/12、每轮exit0，无遗留pnpm/test进程。生产npm仍开放。 |
| Kubernetes immutable image policy | `npx -y pnpm@10.11.0 docker:policy` + v1.35.1 API Server | PASS（本地真实集群） | 证据154–156：Docker/Web与Kubernetes策略29/29；immutable Server/Redis/Web接受，mutable、零digest、不安全init/securityContext及live update拒绝。Redis ready/PONG；Web以UID/GID 101、只读根、8080探针运行并HTTP 200。 |
| Signed image release/admission | `npx -y pnpm@10.11.0 release-image:policy` + Policy Controller/External Secrets/私有registry | PASS（本地生产等价边界） | 证据156：14/14；生产keyless bundle策略2/2 Ready；已签名digest放行、未签名拒绝；External Secrets v1生成有效dockerconfigjson；故障candidate精确回滚baseline。真实protected GitLab OIDC、生产registry/Vault/cluster仍开放。 |
| Historical CI aggregate（目标外） | `npx -y pnpm@10.11.0 ci:verify` | HISTORICAL PASS | 证据156保留当时聚合结果；当前源码只维持既有配置最低一致性，不以远程 CI 为强化完成门槛。 |
| Web visual audit（历史） | archived authenticated Web screenshots | HISTORICAL PASS | 旧截图位于 `artifacts/web-visual-audit-20260705/`；当前不再执行或新增图形化验证。 |
| Web 10-language core slice | authenticated Web 10 locales × 5 routes × 320 plus Account/New Session × 1280 | PASS（限定切片） | 证据132：50个移动状态+20个桌面状态，lang/main/H1、溢出、截断、44点均通过；5个axe状态0 violations。其他路由/状态、Native与51个透明合成面contrast incomplete仍开放。 |
| Web 10-language static routes | authenticated Web 10 locales × 10 routes × 320 plus 5 affected routes × 1280 | PASS（authenticated-empty限定切片） | 证据133：100个移动状态+50个桌面状态，lang/main/H1、溢出、视口外文本、截断、44点全部0；5页axe 0 violations。25个透明合成面contrast incomplete、动态/非空状态及Native仍开放。 |
| Web dynamic Workbench/File/Transfers | authenticated Web real Codex session + machine file RPC + real failed download, seven locales × 320 | PASS（Linux/Web边界） | 证据160：七语言Workbench 7/7无英文回退、溢出或小目标；日语File Preview和非空Transfers最终axe均0，原始backend/platform错误不再进入UI或可访问名称。Native仍开放。 |
| Web lifecycle | authenticated Web + isolated daemon `stop-session` | PASS（终态） | 桌面与 390×844 显示绿色 Archived pill；证据 `docs/audits/evidence/2026-07-14-lifecycle/66-app-archive-stop-observation-and-web-labels.json`。Native timeout/屏幕阅读器仍未通过。 |
| Android APK build | `npx -y pnpm@10.11.0 --filter agenthub-app android:apk:arm64` | PASS | 2026-07-17当前源码（证据171）：production prebuild，1702 tasks/191s；`artifacts/agenthub-production-arm64-20260717-1157.apk`（54,487,098 bytes、0600、SHA-256 `a20e9bb4…7b08`）并刷新byte-identical latest。 |
| Android APK verify | `scripts/verify-agenthub-android-apk.mjs` / Android build tools | PASS（静态） | timestamp/latest两份均exit0：`com.artsum.agenthub` 1.0.0、min24/target36、arm64-v8a、v2签名、ZIP/必需条目通过；正式URL 1、Dev/QA marker 0。ADB无设备，真机与TalkBack不计通过。 |
| Native QA automated contract | Native QA plans/CLIs/evidence auditor | PASS（实现） | 证据174：RED 3 failed/4 passed；GREEN Native QA **9 files/67 tests**、App **251 files/1444 tests**、typecheck exit0。新报告使用`verificationMode=automated-contract`，无截图/人工视觉门槛；历史报告仍只读校验PNG完整性。平台runner实际执行保持Open。 |
| Linux Tauri build | `CI=true npx -y pnpm@10.11.0 --filter agenthub-app tauri:build:production` | PASS（当前源码Linux x86_64） | 证据172：Tauri定向4 files/16 tests、Cargo locked check/lib test及production export/budget通过；deb/rpm/AppImage完成hash、元数据、条目和extract验证。首次错误的`CI=1`调用exit2已单独留证。 |
| Linux Tauri credential lifecycle | Secret Service roundtrip + `tokenStorage` / `tauriCredentialStorage` / `accountRuntime` TDD | PASS（当前源码） | 证据172–173：真实Secret Service write/read/delete，加 **3 files/14 tests** 覆盖跨WebView恢复、注销删除、再次重启未登录、异常cleanup和malformed payload fail-closed；typecheck/Cargo gate exit0。macOS/Windows制品/签名/公证/回滚仍开放。 |

## Historical Web Screenshot Evidence

| 场景 | 截图 |
| --- | --- |
| Desktop light home | `docs/assets/agenthub-1.0/desktop-light-home.png` |
| Desktop dark home | `docs/assets/agenthub-1.0/desktop-dark-home.png` |
| Mobile light new session | `docs/assets/agenthub-1.0/mobile-light-new-session.png` |
| Mobile settings | `docs/assets/agenthub-1.0/mobile-settings-current.png` |

## Remaining Notes

- iOS native QA 未执行；当前 Linux 环境没有 Xcode/simctl，且用户当前不需要 iOS 测试。
- Android arm64 真机自动契约仍依赖外接设备；不要求自动截图或人工视觉验收。
- 当前只要求 Claude Code/Codex 的 backend fatal/idle 与终态收敛。证据168–169中的其他 Provider 结果和缺口只保留历史语境，不再开放或阻断。
- 本地Kubernetes三副本、真实API Server digest/security admission、TLS鉴权registry、签名准入、ExternalSecret v1和rollout rollback已验证；真实protected GitLab OIDC、生产registry/Vault/cluster、外部生产Postgres/Redis/S3和生产npm仍需单独验证。
- 证据193已取代证据170的许可证当前状态：专有`@anthropic-ai/claude-agent-sdk`已从生产依赖和锁文件移除，独立Claude Code transport通过真实active SIGKILL；1549个生产包unresolved 0，真实`license:check`与完整`ci:verify`均exit0。首次protected required pipeline仍需外部证据。
- 证据172–173关闭当前源码Linux Tauri production构建、Secret Service和authenticated credential lifecycle；binary中配置层devUrl静态字符串不等于production加载。macOS/Windows仍不得据此标绿。

## Historical Evidence Log

The entries below preserve the provider, CI, environment, and process state at the time each evidence artifact was produced. They do not reopen removed providers or make remote CI part of the current hardening goal.

ENG-CI-001 / ENG-SC-001 / ENG-TST-001 browser-free required Web contract（2026-07-17，证据175）：required GitLab Web job不再使用Playwright镜像、authenticated dev环境、截图或人工点击。TDD RED **0 passed/3 failed**，GREEN CI拓扑策略 **3/3**、App Web契约 **10 files/54 tests**；JUnit **54/0**、0600。直接root Playwright依赖及两个standalone browser runner删除，offline frozen install exit0并移除179个已安装包；最终当前源码`ci:verify` exit0，7 workspace typecheck与全部既有工程门禁通过。浏览器未启动、孤儿0，生产daemon/runner/三条8443保持。该本地门禁Closed；首次protected GitLab执行与retained artifact仍Open。证据`docs/audits/evidence/2026-07-17-ci/175-browser-free-required-web-contract.json`。

ENG-CI-001 / ENG-SC-001 / ENG-REL-001 protected GitLab evidence collector（2026-07-17，证据177）：新增失败关闭的`pnpm gitlab:evidence`，动态校验20个required jobs、11个retained-artifact jobs、protected master/force-push=false、active schedule及exact-SHA successful pipeline。TDD三轮RED为0/1、8/1、8/1，GREEN **9/9**；无凭据探针exit1且不写报告，完整`ci:verify` exit0。当前GitLab API无有效token而401，因此本地采集器Closed，首次protected执行仍Open。证据`docs/audits/evidence/2026-07-17-ci/177-gitlab-release-evidence-collector.json`。

ENG-CI-001 / ENG-SC-001 / ENG-REL-001 GitLab pagination/latest retry（2026-07-17，证据178）：第一页缺schedule而第二页有效的专项 **0/1 RED**；现对schedule、exact-SHA pipeline及include_retried jobs完整分页，合并后按最高job id选择最新重试，畸形/不递增/>100页失败关闭。GREEN **13/13**，完整`ci:verify` exit0，daemon/runner/连接不变量保持。分页子风险Closed，真实protected执行仍Open。证据`docs/audits/evidence/2026-07-17-ci/178-gitlab-api-pagination-and-retry-selection.json`。

ENG-CI-001 / ENG-SC-001 / ENG-REL-001 GitLab API bounded transport（2026-07-17，证据179）：六类RED覆盖无Abort、503不重试、Content-Length/流式超限、redirect与环境配置。现默认15s×3、仅重试429/502/503/504、250ms、redirect=error、2MiB流式上限，覆盖值全部范围校验。GREEN **18/18**、完整`ci:verify` exit0；无浏览器且daemon不变量保持。本地传输边界Closed，外部首次执行Open。证据`docs/audits/evidence/2026-07-17-ci/179-gitlab-api-timeout-retry-response-boundary.json`。

ENG-CI-001 / ENG-SC-001 / ENG-REL-001 GitLab latest push/artifact freshness（2026-07-17，证据180）：最新失败回退旧成功、source=web、expired artifact、path-like project id四项 **0/4 RED**。现最高pipeline ID必须success push，detail身份再确认；project/schedule/pipeline/job ID正整数，artifact expiry必须有效且未过期。GREEN **27/27**、完整`ci:verify` exit0。本地子项Closed，外部首次执行Open。证据`docs/audits/evidence/2026-07-17-ci/180-gitlab-latest-push-pipeline-artifact-freshness.json`。

ENG-CI-001 / ENG-REL-001 / CLI-REL-001 protected schedule switches（2026-07-17，证据181）：策略/执行 **0/2 RED**。从真实YAML自动推导Provider integration/matrix与Platform integration三项true，schedule detail须同身份且变量唯一env_var；报告仅写名称。GREEN **29/29**、完整`ci:verify` exit0。本地Closed，真实protected schedule无skip执行Open。证据`docs/audits/evidence/2026-07-17-ci/181-protected-schedule-integration-switches.json`。

ENG-CI-001 / ENG-REL-001 / CLI-REL-001 latest schedule execution（2026-07-17，证据182）：YAML推导6个required/5个artifact schedule jobs；五类RED后要求latest schedule pipeline success、detail身份一致、全页latest jobs无skip/allow-failure且artifact未过期。GREEN **33/33**、完整`ci:verify` exit0。本地能力Closed，真实GitLab API 401仍Open。证据`docs/audits/evidence/2026-07-17-ci/182-latest-protected-schedule-pipeline-jobs-artifacts.json`。

ENG-CI-001 / ENG-REL-001 / CLI-REL-001 schedule freshness（2026-07-17，证据183）：stale **3/1 RED**、config **0/1 RED**；updated_at须有效、≤capturedAt+5m且默认≤48h，override范围1–720h。GREEN **36/36**、完整`ci:verify` exit0。本地Closed，真实GitLab API Open。证据`docs/audits/evidence/2026-07-17-ci/183-protected-schedule-freshness-window.json`。

ENG-CI-001 / ENG-SC-001 / ENG-REL-001 evidence path/target boundary（2026-07-17，证据184）：symlink输出父目录与异常API target **35/37、2 failed RED**。创建前后逐级拒绝symlink；URL禁止credentials/query/hash/traversal/非`/api/v4`，项目路径限规范namespace/project。GREEN **37/37**、完整`ci:verify` exit0。本地Closed，真实GitLab API Open。证据`docs/audits/evidence/2026-07-17-ci/184-gitlab-evidence-path-and-target-boundary.json`。

ENG-CI-001 / ENG-SC-001 / ENG-REL-001 authenticated origin/workspace confinement（2026-07-17，证据185）：跨origin鉴权与项目外输出 **36/38、2 failed RED**。API origin绑定`CI_SERVER_URL`，输出绝对解析并限制于`CI_PROJECT_DIR`后再走symlink/private atomic门禁。GREEN **38/38**、完整`ci:verify` exit0。本地Closed，真实GitLab API Open。证据`docs/audits/evidence/2026-07-17-ci/185-gitlab-evidence-origin-and-workspace-confinement.json`。

ENG-CI-001 / ENG-REL-001 required pipeline/no direct push（2026-07-17，证据186）：三个绕过场景RED汇总 **37/42、5 failed**；merge必须pipeline success，master direct push只允许No one且无actor例外。GREEN **42/42**、完整`ci:verify` exit0。本地Closed，真实配置API证据Open。证据`docs/audits/evidence/2026-07-17-ci/186-gitlab-required-pipeline-and-no-direct-push.json`。

ENG-CI-001 / ENG-SC-001 / ENG-REL-001 immutable CI images/transient registry recovery（2026-07-17，证据187）：default image策略 **6/7 RED→7/7**，所有default/job/service image须sha256；首次总回归暴露registry **8/9 timeout**，恢复策略 **0/2 RED→2/2**，只对明确瞬时错误重试一次，真实journey **11/11**，最终`ci:verify` exit0。证据`docs/audits/evidence/2026-07-17-ci/187-gitlab-image-digest-and-registry-transient-recovery.json`。

ENG-CI-001 / ENG-SC-001 protected/unprotected cache isolation（2026-07-17，证据188）：lockfile-only cache key跨信任边界风险先 **7/8、1 failed RED**；现以`CI_COMMIT_REF_PROTECTED`分区并显式`unprotect:false`，保留lockfile内容键。GREEN **8/8**、完整`ci:verify` exit0；无浏览器且daemon不变量保持。本地Closed，真实protected runner缓存证据Open。证据`docs/audits/evidence/2026-07-17-ci/188-protected-unprotected-cache-isolation.json`。

ENG-CI-001 / ENG-SC-001 / ENG-DKR-001 / ENG-REL-001 pnpm bootstrap archive integrity（2026-07-17，证据189）：version-only引导先 **8/9、1 failed RED**；根`packageManager`现绑定pnpm 10.11.0归档SHA-512，CI/Docker移除`corepack prepare pnpm@10.11.0`并设置`COREPACK_DEFAULT_TO_LATEST=0`，metadata精确门禁同步。GREEN **15/15**，固定digest Node20真实Corepack smoke为10.11.0，Docker/K8s **29/29**，完整`ci:verify` exit0、供应链 **9/9**。本地Closed，protected GitLab/完整镜像构建仍Open。证据`docs/audits/evidence/2026-07-17-ci/189-pnpm-bootstrap-archive-integrity.json`。

ENG-DKR-001 / ENG-SC-001 / ENG-REL-001 local Kubernetes image/load boundary（2026-07-17，证据190）：五个mutable第三方镜像先 **19/20 RED**，全部固定版本+multiarch digest且registry重算5/5；默认kubectl kustomize另以exit1暴露父目录引用。Server清单迁入base单一事实源，移除`LoadRestrictionsNone`并同步全部活跃release调用者。迁移夹具 **49/50→51/51**，默认restrictor渲染exit0，完整`ci:verify` exit0、Docker/K8s **31/31**。本地Closed，fresh cluster smoke与protected生产发布仍Open。证据`docs/audits/evidence/2026-07-17-ci/190-local-kubernetes-immutable-images-and-load-boundary.json`。

ENG-DKR-001 / ENG-REL-001 / CLI-REL-003 fresh cluster与冷启动门禁（2026-07-17，证据191）：隔离Kubernetes v1.35.1真实apply exit0，45/45 migrations、Server 3/3和全依赖Ready、health 200、7/7运行时远程digest。首次冷启动Server抢跑依赖产生重启，经 **21/22 RED→4 files/52 GREEN** 增加安全init gate；真实重滚3副本init exit0、restart 0/0/0。完整`ci:verify` exit0、Docker/K8s **32/32**，环境全清理。本地fresh-cluster子门禁Closed，protected生产OIDC/registry/Vault/cluster发布Open。证据`docs/audits/evidence/2026-07-17-ci/191-fresh-kubernetes-smoke-and-cold-start-gate.json`。

CLI-REL-001 / CLI-REL-002 / CLI-REL-005 / CLI-REL-006 / CLI-REL-007 / ENG-ENV-001 provider fault/isolation（2026-07-17，证据192）：Codex/Claude/ACP idle+active真实恢复 **6/6**；环境策略 **28/28**，共享CLI dist快照前后一致，私有环境与孤儿进程清零。生产daemon/runner/三连接不变量保持。有效Gemini、live OpenClaw、protected artifact与macOS/Windows保持Open。证据`docs/audits/evidence/2026-07-17-ci/192-provider-fault-submatrix-and-private-cli-isolation.json`。

CLI-REL-001 / CLI-REL-005 / ENG-SC-001 / ENG-CI-001 / ENG-TST-001 external Claude transport/license closure（2026-07-17，证据193）：专有SDK已从CLI/Codium生产依赖及锁文件移除；独立Claude Code stream-json transport **4/4**、定向 **22/22**、真实active SIGKILL **1/1**。直接门禁缺`--prod`先RED，修复后CLI **777/777**、Codium **92/92**、生产1549包unresolved 0、license **5/5**、供应链 **11/11**、全workspace typecheck和完整`ci:verify`均exit0。许可证子项Closed，protected GitLab/外部Provider/跨平台仍Open。证据`docs/audits/evidence/2026-07-17-ci/193-external-claude-cli-transport-and-license-closure.json`。

CLI-REL-001 / CLI-REL-005 / ENG-CI-001 / ENG-SC-001 / ENG-REL-001 frozen Provider toolchain（2026-07-17，证据194）：全局npm安装、Node20引擎和postinstall拒绝依次RED；最终41坐标/0缺SHA-512、Node22固定digest、四包精确脚本allowlist。主机与不可变容器四版本smoke exit0，定向18/18、metadata ok、供应链12/12、完整`ci:verify` exit0。安装边界Closed，protected真实凭据/retained artifact仍Open。证据`docs/audits/evidence/2026-07-17-ci/194-frozen-provider-toolchain-integrity-and-node22-smoke.json`。

ENG-CI-001 / ENG-SC-001 / ENG-REL-001 / CLI-REL-001 / CLI-REL-005 Provider audit/OSV/SBOM/license（2026-07-17，证据195）：先以RED证明独立lock缺扫描及`audit:check`覆写报告；最终Provider audit 37/全0、hash不变、reachable 0、OSV 0、SBOM 41组件并进入provenance/独立签名契约，许可证原始清单保留Unknown7。定向23/23、完整`ci:verify` 103+147 assertions、exit0，根license1549/0 unresolved。源码门禁Closed；protected OIDC/retained artifact仍Open。证据`docs/audits/evidence/2026-07-17-ci/195-provider-toolchain-audit-osv-sbom-license-coverage.json`。

ENG-DKR-001 / ENG-SC-001 / ENG-CI-001 / SRV-PERF-001 Server production runtime/context（2026-07-17，证据196）：production-deps物理清空旧virtual store后以isolated/no-hoist/offline/frozen重建336包；`.dockerignore`排除嵌套env、本地PGlite data/WAL和日志；patch以原子rename隔离store hardlink。真实镜像835.6→640.6MB、45 migrations/health ok，Docker/K8s34/34、metadata7/7、audit/OSV/SBOM/license及完整`ci:verify` exit0。源码边界Closed；protected生产发布仍Open。证据`docs/audits/evidence/2026-07-17-ci/196-server-runtime-context-secret-and-production-prune.json`。

SRV-PERF-001 / ENG-DKR-001 / ENG-SC-001 / ENG-CI-001 compiled Server runtime（2026-07-17，证据197）：esbuild0.27.2原子生成Node20 ESM，Wire保持external包所有权；Docker默认CMD只运行main.mjs且无source/TSX/TypeScript/Vitest。PGlite/PostgreSQL各45 migrations/health200、SIGTERM exit0，Server145 passed/2 external skipped、Docker/K8s34/34、完整CI和供应链全绿。动态转译子项Closed；独立migration image与protected生产发布Open。证据`docs/audits/evidence/2026-07-17-ci/197-server-compiled-node-runtime-and-dual-database-smoke.json`。

SRV-PERF-001 / ENG-DKR-001 / ENG-SC-001 / ENG-CI-001 / ENG-REL-001 runtime/migration split（2026-07-17，证据198）：最小独立runtime lock覆盖编译external，在线镜像排除Prisma CLI/schema及构建测试工具并降至370.3MB；独立migration target、local双镜像、protected build/sign和三镜像admission已接入。双数据库45 migrations/health200/SIGTERM0，Server145 passed/2 external skipped，定向52/52、完整CI和根/runtime供应链全绿。本地边界Closed；生产migration Job编排与真实protected发布Open。证据`docs/audits/evidence/2026-07-17-ci/198-server-runtime-lock-and-migration-image.json`。

ENG-REL-001 / ENG-DKR-001 / ENG-SC-001 / ENG-CI-001 production migration Job（2026-07-17，证据199）：34/6 RED后实现双验签、stable-v1 secrets Ready、安全fresh Job、Complete/log-before-Deployment及失败Job删除/私有报告。定向72/72、完整CI exit0，固定kubectl base/local渲染通过。本地编排Closed；真实protected job/artifact Open。证据`docs/audits/evidence/2026-07-17-ci/199-production-migration-job-release-orchestration.json`。

ENG-REL-001 / CLI-REL-001 / CLI-REL-005 / ENG-ENV-001 / APP-REL-001 本机部署与生产发布（2026-07-18，证据219）：Server隔离依赖路径修复并完成5个迁移、用途隔离密钥切换与本地/公网health200，service active/running、NRestarts0。CLI **107 files/709 tests**、metadata **8/8**、build/typecheck exit0；npm `@artsum/agenthub@1.0.4`发布成功且`latest=1.0.4`，本机全局CLI同步完成。Android production arm64最终包57,909,638 bytes，SHA-256 `9425e0ed…58cf`，签名v2/ZIP/ABI通过；Version19 changelog **7/7**。daemon bundle已为1.0.4，两个runner在KillMode=process切换中保留；旧Token安全失效后的`auth login --force`、最终runner收养/8443及真机安装列为非阻塞人工验收。证据`docs/audits/evidence/2026-07-18-release/219-local-server-cli-1.0.4-npm-and-android-delivery.json`。
