# AgentHub 全栈安全、性能与产品体验审计基线

> 基线日期：2026-07-11
> 基线提交：`5c74ea1e1966881719ed22d598a9955650329304`
> 审计状态：持续维护；结论随验证矩阵更新，不以本文替代测试证据。

## 1. 目标与不变量

本审计用于推动 AgentHub 在不改变产品哲学的前提下达到可发布的安全、可靠性和体验标准。必须保持：

- 自托管与端到端加密边界；服务端不得新增无必要的明文访问能力。
- 移动端是远程控制与持续工作台，不演变为完整桌面 IDE。
- 继续使用 Amber Crystal、现有 tokens、字体和信息密度语言。
- Linux `agenthub-daemon.service` 使用 `KillMode=process`；bundle 替换由 `Restart=on-failure` 接管。
- runner 在 SIGTERM、SIGINT、归档、backend fatal 和异常退出时补齐 active turn 的 `turn-end`、`thinking=false`、archive 与 session-end。

### 2026-07-18 当前范围覆盖决策

- 产品能力只保留 Claude Code 与 Codex；Gemini、OpenClaw、OpenCode 与通用 ACP 的启动、认证、配置、专用 UI、依赖和测试退出范围并从产品代码删除。
- 历史会话可以通过通用消息解析继续只读显示，但不得再创建、恢复或配置已移除 Provider。
- CI/GitLab、OIDC、远程 artifact、protected runner 与生产集群证据不再属于本目标完成条件；本文后续相关内容保留为历史审计记录，不代表当前开放项。
- 当前环境不能自动执行的 Native、跨平台、推送、证书及生产基础设施验证转入 `docs/audits/2026-07-18-manual-acceptance-checklist.md`，不阻塞本地开发完成。

## 2. 系统边界

```text
Expo App / Web / Tauri
  ├─ root secret、消息解密、Zustand、文件/Git/传输/UI
  └─ HTTP / Socket.IO / RPC
                 │
          @artsum/agenthub-wire
                 │
AgentHub Server ─┼─ PostgreSQL/PGlite、Redis Streams、对象/本地存储
                 │
Machine daemon ──┼─ loopback control、adoption、bundle update
                 └─ Claude Code / Codex runner
```

主要信任边界是账号根密钥、服务端 bearer/pairing、拥有 Shell 权限的 daemon/runner，以及 Web/Tauri 浏览器执行环境。

## 3. 审计方法与证据

- 工作流治理：全局禁用 `superpowers:using-superpowers`，不得调用、读取或将其作为任何审计、计划、开发、排查、验证任务的入口/前置条件；需要技能时直接选择具体适用技能。
- 静态检查 App、Wire、Agent、Server、CLI/daemon/runner、Docker/K8s、发布和文档。
- 在 authenticated dev Web 环境检查首页、新建会话、设备、设置、外观、移动断点、键盘和无障碍树。
- 运行根检查、分包 typecheck/build/unit；执行生产 Web export、依赖 audit 和进程治理复核。
- 未实际执行命令注入、Mermaid exploit、生产数据库破坏性并发、Native 真机或 VoiceOver/TalkBack，因此这些必须在修复任务中补充受控验证。

基线测试结果：Server 80/80、Agent 228/228、Wire 21/21、CLI unit 661/661；App 950 通过、1 失败、57 跳过。Coverage 因缺少 `@vitest/coverage-v8` 无法运行。仓库约有 257 个测试文件，但 GitLab `master` 没有仓库内 required pipeline。

## 4. 风险目录

### 发布阻断级

#### APP-SEC-001：恶意文件名与 worktree 路径进入 Shell

- 当前状态：`Closed`；Wire `exec` 结构化契约与 CLI `execFile` 无 Shell handler 已落地，App 内部 Git/worktree/file 调用均迁为 executable+argv+cwd；用户主动终端 `bash` 能力继续保留。authenticated Web 已通过真实 session RPC 验证恶意文件读取与 sentinel 缺失。
- 证据：`packages/agenthub-app/sources/hooks/usePrefetchFileContents.ts:34`、`sources/components/InlineFileDiff.tsx:58`、`sources/utils/worktree.ts:154`。
- 触发：打开包含 `$()`、反引号等特殊文件名的仓库文件页，或删除特殊字符 worktree。
- 影响：在 Agent 机器上以 runner 用户权限执行额外命令。
- 修复：内部操作统一结构化 executable/argv/cwd，CLI 以 `execFile` 执行；限制参数数量/长度、timeout 与受管 worktree 边界，不再依赖 quoting 作为主要防线。
- 验证：加密 RpcHandlerManager 与 authenticated Web 在线 session RPC 均已读取恶意名称文件且未创建 sentinel；worktree 受管单段边界与单 argv descriptor 已由负测锁定。

#### APP-SEC-002：Native 注销未重置同步单例

- 当前状态：`Mitigated`；已实现幂等 shutdown/resetAccount、账号态内存/传输/Socket 清理、初始化失败回滚、统一 AbortSignal/账号代次提交保护和 route-group guard。Web 已验证真实注销、旧深链拦截及重新登录；Android API 36 已完成两套真实账号 A→注销→旧深链→B，以及故意挂起账号请求期间注销的原生验证。iOS 同矩阵尚未完成，因此不得标记关闭。

- 最新本地证据（2026-07-12）：App 全量 **180 files / 1163 passed**，账号运行编排、代次 Abort、慢响应拒绝、同名资源隔离和未认证深链守卫均纳入测试；证据 `docs/audits/evidence/2026-07-12-regression/30-local-full-regression-after-acp-idle.json`。Native 双账号/返回栈/设备级证据仍开放。
- 最新本地加固（2026-07-12）：新增容错账号操作队列，串行化 AuthProvider login/logout/switchServer，先失败后修复专项 **3 files/14 passed**；App 全量升至 **181 files/1165 passed**，typecheck/diff check 通过。证据 `docs/audits/evidence/2026-07-12-regression/31-account-operation-queue.json`。Native 双账号/返回栈/设备级证据仍开放。
- AuthProvider account-operation queue 后 pinned `ci:verify` 刷新（2026-07-12 18:20–18:21）：退出码 **0**，workspace typecheck、环境 22/22、Docker 8/8、SBOM/provenance/audit/reachability/license、metadata 和 supply-chain policy 全部通过；证据 `docs/audits/evidence/2026-07-12-ci/32-ci-verify-account-queue.json`。Native 双账号/返回栈/设备级证据仍开放。
- Android 原生账号隔离与返回栈补证（2026-07-15）：真实 A→注销→旧 A session 深链→B 首轮复现 Expo Router Drawer state 崩溃；根因为 Native 根导航器在未认证 `Slot` 与认证 `Drawer` 之间切换，旧 Stack 深链状态缺少 Drawer `status`。GitNexus 上游影响为 LOW。按 TDD 固定 Native 始终构造 Drawer、Web 未认证继续使用 Slot（保留 WebKit/Tauri React #130 修复）；定向 **2 files/5 tests**、App 全量 **183 files/1180 tests**、typecheck 均通过。新 Preview APK 上完整序列通过，A/B public ID 不同，root secret 从未 reveal/copy，旧深链停留未认证根，B 登录后无 Drawer/React 错误。最终 production APK **1708 tasks/44s**，正式验证器确认 arm64/v2 签名/ZIP/必需条目通过。证据 `docs/audits/evidence/2026-07-15-native/72-android-account-isolation-and-navigation-state.json`。iOS 同矩阵仍开放，状态保持 Mitigated。
- Android 设备级强制慢响应补证（2026-07-15）：新增 QA-only response-delay proxy 并先以 module-not-found 取得 RED，随后正常转发、显式 hold/release、客户端 Abort 三个契约 **3/3 PASS**。在隔离 authenticated server 与 API 36 Preview 上，App 后台后挂起前台恢复触发的 `/v1/sessions`，响应保持 `held` 时确认注销；代理记录 `downstream-aborted`，随后 B identity hash 与 A 不同，未见 A 数据且 root secret 从未 reveal/copy。临时 HTTPS 隧道、代理、环境和模拟器全部清理，生产 daemon/runner/8443 不变量保持。证据 `docs/audits/evidence/2026-07-15-native/73-android-slow-response-and-env-list-redaction.json`。Android 慢响应边界已关闭，APP-SEC-002 只剩 iOS。
- 证据：`sources/auth/AuthContext.tsx:44`、`sources/sync/sync.ts:1966`、`sources/sync/apiSocket.ts:65`。
- 触发：同进程 A 登录、注销、B 登录，或注销后通过返回栈/深链进入受保护页面。
- 影响：A 的 socket、密钥、会话和已解密明文可能继续显示给 B。
- 修复：原子 `sync.shutdown/resetAccount()`、请求代次/取消和 route-group 认证守卫。
- 验证：A→B 自动化断言旧连接关闭、全部账号级内存清空、深链回登录页。

### App / Web / Tauri

| ID | 等级 | 问题 | 主要证据 | 关闭标准 |
|---|---|---|---|---|
| APP-SEC-003 | P1 | Native Mermaid 可闭合 inline script，WebView 无 CSP/来源限制且依赖 CDN；当前 Android 边界已实测 | `MermaidRenderer.tsx:108` | Android 已完成；仍需 iOS 断网正常/错误/恶意输入同矩阵 |
| APP-SEC-004 | P1 | 基线 Web/Tauri 将 token 与 root secret 写入 localStorage，Tauri CSP 关闭；当前 Web 已改为页面内存，Tauri 已改为系统 keyring 并收紧 CSP/capability | `tokenStorage.ts`、`tauriCredentialStorage.ts`、`rootInitialization.ts`、`SidebarNavigator.tsx`、`src-tauri/src/lib.rs`、`src-tauri/tauri.conf.json` | 已关闭：产品方于 2026-07-11 明确接受 Web 刷新/关闭后重新登录，页面内存凭据成为默认安全策略；Tauri Secret Service 三进程 write/read/delete、正常登录 UI、密钥环失败 Retry UI、production CSP/WebKitGTK 均已实测。root secret 显示/复制的设备认证等由 APP-SEC-007 继续跟踪 |
| APP-SEC-005 | P1 | 生产包含 21 个 dev routes，可被自定义 scheme 深链 | `(app)/_layout.tsx:253` | release bundle 无 dev route，深链安全落点 |
| APP-SEC-006 | P1 | 基线远程 HTTP 可承载 bearer，切换 server 后 socket/API 端点分裂；当前已关闭 | `sync/serverConfig.ts`、`auth/accountRuntime.ts`、`auth/AuthContext.tsx`、`app/(app)/server.tsx` | 仅 HTTPS 或 loopback dev HTTP；仅允许 origin；切换先完整 teardown/移除旧凭据，再提交端点并进入未认证态，清凭据失败不提交。专项 10/10、App 1141/1141、authenticated Web 原子退出证据全绿 |
| APP-SEC-007 | P1 | 基线 root secret 显示、复制、截图无本地认证；当前代码防护、Web 与 Android 实测完成 | `settings/account.tsx`、`auth/secretProtection.ts`、`app.config.js` | Android 已完成；仍需 iOS reveal/copy 认证、App Switcher、后台和剪贴板同矩阵后关闭 |
| APP-REL-001 | P1 | 基线初始化异常会永久 splash，且同步初始化标志失败不回滚；当前已关闭 | `app/_layout.tsx`、`testing/rootInitialization.ts`、`sync/initializationGate.ts`、`sync/sync.ts` | 根布局 loading/ready/error 与显式 Retry；同步失败 shutdown 回滚、并发合并、reset 等待及前后清理，失败后可在同进程重试。专项 8/8、App 1135/1135、typecheck 全绿；authenticated Web 瞬态 NetworkError 后恢复 ready |
| APP-REL-002 | P1 | 基线 RPC 无 ack timeout、HTTP 无截止时间、无限 backoff 不区分错误且队列终态可挂死；当前已关闭 | `apiSocket.ts`、`httpClient.ts`、`authenticatedHttpClient.ts`、`publicHttpClient.ts`、`utils/time.ts`、`utils/sync.ts` | RPC 15s；AgentHub HTTP 全面统一 timeout/signal/HttpStatusError/Zod/幂等有界重试；真实 401/429/503/timeout server 与 App 1122/1122 全绿 |
| APP-PERF-001 | P1 | 基线文件预览写缓存触发 effect 再请求；当前已关闭 | `session/[id]/file.tsx`、`utils/filePreviewRequestLifecycle.test.ts` | 已验证加载 effect 不依赖缓存对象；同一挂载固定 route 缓存写回不重启请求，路由身份变化仍刷新；专项 1/1、App 1086/1086、typecheck 全绿 |
| APP-PERF-002 | P2 | Closed：可见窗口预取、有界缓存与 10,007 文件列表虚拟化均已实现并取得真实 authenticated production Web 证据 | `usePrefetchFileContents.ts`、`hooks/filePrefetchPolicy.ts`、`sync/filePreviewCachePolicy.ts`、`utils/gitFileListRows.ts`、`files.tsx` | 预取限于真实可见窗口+lookahead、并发 3、合作式取消；缓存为 128 项/16MiB 全局 LRU，并按 OID/状态版本/5 分钟 TTL 失效。证据111的旧列表在10,007项下超过30秒无响应、renderer RSS 3,066,508KB；FlatList+精确异高布局后点击0.24秒，桌面顶部/中部/末尾仅挂载约20项，DOM 602/1009/781、Heap 74.1/43.9/44.7MB、renderer RSS 290,604KB（较RED约降90.5%），移动390×844完整滚至最后一项且无横向溢出。搜索、分组、文件索引、真实RPC/HAR、缩放与预取取消均有证据；本地子风险关闭 |
| APP-PERF-003 | P2 | Closed（含受控残余风险）：长会话、分页、超时、inactive保留、首屏预算及资产边界均完成；libsodium保持协议兼容的按需独立chunk | `sync/storage.ts`、`sync/sessionMessageIndex.ts`、`sync/messageCatchupBuffer.ts`、`sync/paginationRetryGuard.ts`、`sync/sessionMessageLoadState.ts`、`components/historyPaginationGate.ts`、`useGroupedMessages.ts`、`utils/web/faviconGenerator.ts`、`scripts/webBundleBudget.cjs` | 证据157–158：10k replacement p95 **6.061→0.593ms（-90.2%）**，50×10k inactive回收59.5%；100页追赶store提交100→10且seq仅随commit推进，重复authenticated 10k live chase dev峰值 **475,033,024→307,694,675 bytes（-35.2%）**。production export 11,443,014 bytes、bootstrap **976,871 gzip**，favicon稳定单请求。932,122-byte libsodium chunk因现有Curve25519-XSalsa20-Poly1305、XSalsa20-Poly1305和Ed25519协议兼容继续按需加载，残余风险由AgentHub security/release maintainer负责，2026-08-15前仅评估独立审计且完全兼容的最小构建 |

#### APP-SEC-003 当前处置

- 当前状态：`Mitigated`。Native 已改用随包交付且 SHA-384 固定的 Mermaid 11.12.2 资源，不再访问 CDN；每次 WebView 使用随机 bridge token 与 script nonce，并限制 CSP、顶层导航、存储、Cookie、文件访问、窗口和 mixed content。
- 已验证：闭合 script/Unicode 分隔符注入、伪造或越界尺寸消息、外部导航、资源摘要和 Metro 打包声明；authenticated Web 已验证正常图、语法错误卡片和异常临时 DOM 清理。
- Android 补证（2026-07-15）：API 36 Preview 在 `Wi-Fi is disabled`、`Active default network: none` 下同时完成正常图、语法错误和 `</script>`/伪 bridge/外部链接恶意输入；恶意文本只以转义 parse-error 呈现，无导航、ANR 或 FATAL。安全专项 **11/11**、production route/build 边界 **12/12**、typecheck 和 Preview arm64 构建通过。证据 `docs/audits/evidence/2026-07-15-native/76-android-mermaid-and-secret-protection.json`。
- 剩余关闭条件：iOS 断网同矩阵；Android 子风险已关闭但 APP-SEC-003 保持 `Mitigated`。

#### APP-SEC-005 当前处置

- 当前状态：`Closed`。Metro 仅在 production/未声明 `APP_ENV` 时使用排除任意 `/dev/` 子树的 Router context；development 与明确的非生产 Preview 保留开发路由。release Preview 只为 Native QA 注册并允许未认证 QA Dev Routes；production 布局不注册且 bundle 不包含这些 Screen。
- 已验证：初始生产边界 RED→GREEN 4/4；Preview runtime 边界 RED→GREEN 5/5；production Web export 成功；Web `/dev` 返回 Expo `Unmatched Route`。production arm64 APK 仅含 arm64-v8a、签名有效，Hermes bundle 未发现 dev fixture；API 36 production `agenthub://dev` 为 `Unmatched Route`。当前源码 Preview 四场景可达且完成语义/截图 QA，而随后重建的 production bundle 为 2882 modules（Preview 2919），生产烟测只显示完整未登录产品页。证据 `docs/audits/evidence/2026-07-14-native/60-preview-visual-and-production-rebuild.json`。

#### APP-SEC-006 当前处置

- 当前状态：`Closed`。服务器切换不再由页面直接写配置，而是作为账号级安全边界执行：旧 push token 尽力撤销、同步/Socket/请求与账号缓存关闭、持久投影清理、旧凭据确认删除，随后才原子提交规范化 origin 并进入未认证态；任一步关键清理失败都不会修改端点。
- URL 策略：远程端点必须 HTTPS；开发期仅允许 localhost、127.0.0.1 和 `[::1]` 使用 HTTP；拒绝 userinfo、子路径、query 与 fragment，提交值规范化为唯一 origin。
- 已验证：RED 2/2、GREEN 专项 10/10、App 176 files/1141 tests、typecheck/diff check exit 0。authenticated Web 对远程 HTTP 显示明确错误；Reset 确认后旧账号退出、敏感查询参数消失、localStorage/sessionStorage 的 auth 均为 null。隔离环境与浏览器已清理。
| APP-ARCH-001 | P2 | 基线 App/Wire/Agent 重复 envelope、MessageMeta 并发生 mimeType/permissionMode 漂移；当前已关闭 | `wire/src/sessionProtocol.ts`、`wire/src/messageMeta.ts`、`typesRaw.ts`、`typesMessageMeta.ts`、CLI `api/types.ts` | 核心 envelope/MessageMeta 仅 Wire 定义；App/CLI re-export/直接解析，Agent Wire alias，MobileMeta 为 Pick adapter；自定义模式传输保真并在 runner 边界校验，mimeType/images/fileReferences 保真；架构守卫、跨包全量与静态扫描全绿 |
| APP-ARCH-002 | P2 | 基线 Axios/fetch/Socket HTTP 三套错误与超时模型；当前已关闭 | `httpClient.ts`、`apiSocket.ts`、`wire/src/rpc.ts`、`RpcHandlerManager.ts` | HTTP 统一 typed core；RPC 具备 timeout、caller AbortSignal、结构化 RpcError/E2EE failure、31 方法编译期推导和双端 Zod；CLI workspace Wire/包契约、void→null、文件预取真实取消均全量验证。动态 daemon 扩展仍按开放方法兼容 |

### Server

| ID | 等级 | 问题 | 主要证据 | 关闭标准 |
|---|---|---|---|---|
| SRV-SEC-001 | P1 | Closed：基线 Pairing 仅凭 publicKey 轮询、无 TTL/消费状态；现已统一加固 Terminal/Account 两条流程 | `authRoutes.ts`、`app/auth/pairing.ts`、Prisma `TerminalAuthRequest`/`AccountAuthRequest`、App/CLI/Agent auth clients | 32字节 polling secret 仅存 SHA-256、5分钟 TTL、审批过期拒绝、CAS 一次领取、终端 status Bearer 认证；PostgreSQL 双并发仅一成功，四端全量回归通过 |
| SRV-SEC-002 | P1 | Closed：基线 token 无 exp、撤销仅内存 cache、签名 challenge 可重放；现已改为数据库权威 Token 生命周期 | `auth/auth.ts`、`authRoutes.ts`、Prisma `AuthToken`/`AuthChallenge` | Token 带 exp/jti/keyVersion，默认 30 天；每次鉴权查持久状态，单 token/账号级吊销立即生效；版本化多密钥支持重叠轮换；challenge 32 字节且摘要永久唯一。Server 118 tests 与 build 通过，PostgreSQL 16 第42个 migration、吊销及重复 challenge 约束实测通过 |
| SRV-SEC-003 | P1 | Mitigated：基线仓库追踪 64 字符非占位 master secret，且 Token、托管凭据、本地文件签名复用；当前工作树已删除具体 `.env.dev`/`secrets.yaml`，改为占位示例，生产强制用途隔离和版本化数据/Token 密钥环，GitLab 接入官方 Secret Detection 与阻断式策略测试 | `config/env.ts`、`config/versionedSecrets.ts`、`modules/encrypt.ts`、`auth/auth.ts`、`.gitlab-ci.yml`、`docs/security/server-key-rotation.md` | 数据 active key 写入/旧 key 解密、Token 重叠轮换、本地文件独立签名；Server 122 tests/build 通过。尚须在外部 Vault 执行真实轮换、审阅首次历史扫描并取得 pipeline/部署证据后才能 Closed |
| SRV-SEC-004 | P1 | Closed：运输、字段、速率并发、六类数据库配额及 Redis 全局 rate 均已完成 | `api/api.ts`、`api/socket.ts`、`resourceLimits.ts`、`distributedRateLimits.ts`、`distributedResourceLimits.integration.test.ts`、`validationLimits.ts`、`accountQuotas.ts`、HTTP/Socket/RPC/资源 handlers | HTTP/Socket 8MiB+真实413；HTTP/Socket/RPC backpressure；E2EE字段有界；六类配额均为 Serializable 事务；Redis Lua 原子窗口、哈希 key、故障有界降级。Server 112/112；双进程 PostgreSQL 配额、双进程 Redis rate 均严格仅一成功；双 Server 真实 HTTP/Socket E2E 2/2 |
| SRV-OBS-001 | P1 | 基线任意客户端 Header、未匹配 path 与 RPC method 可进入 Prometheus label；当前已关闭 | `monitoring/metrics2.ts`、`api/utils/enableMonitoring.ts`、`api/socket/rpcHandler.ts`、`monitoring/metricsLabels.test.ts` | client 固定 family、route 仅内部模板、RPC 仅 Wire registry；未知聚合。三类 10k 随机输入 series label 均收敛为 1，Server 86/86、typecheck 全绿 |
| SRV-REL-001 | P1 | 基线 `afterTx` 不 await async callback；当前已关闭 | `storage/inTx.ts`、`storage/inTx.test.ts` | post-commit callback 支持 Promise 并逐个 await；rejection 可观察、不触发 unhandled、也不回滚已提交事务。RED 0/2→GREEN 2/2，Server 82/82、typecheck 全绿 |
| SRV-REL-002 | P1 | 基线 Artifact REST 读版本后无条件更新，存在 CAS 竞态；当前已关闭 | `routes/artifactsRoutes.ts`、`routes/artifactsRoutes.test.ts` | tenant/id/expected version 数据库条件 updateMany；同版本并发仅一个成功/发事件，失败重读最新密文版本；seq 原子递增。并发 RED→GREEN、Server 83/83、typecheck 全绿 |
| SRV-REL-009 | P1 | 基线账号级UsageReport依赖nullable `sessionId`复合唯一键，真实Socket写入无法生成Prisma upsert input；当前已关闭 | `prisma/schema.prisma`、`20260716000000_add_usage_report_scope_key`、`socket/usageHandler.ts`及测试 | 非空scopeKey区分account/session scope并迁移回填；Handler/Schema 3/3、真实Socket 2 reports/30,540 tokens、Server 137 tests、typecheck/schema验证通过 |
| SRV-REL-010 | P1 | Closed：SIGINT关闭时数据库与keepAlive并发收尾，且session-timeout存在重复无限循环；现已按入口→后台→资源三阶段关闭 | `utils/shutdown.ts`、`utils/shutdown.test.ts`、`app/presence/timeout.ts`及测试、证据129/130 | SIGTERM顺序RED 0/1→GREEN 1/1；单次sweep契约1/1；真实SIGINT按2 ingress→2 background→2 resource完成，0 engine warning、0 handler error；Server 139 tests与typecheck通过 |
| SRV-PERF-001 | P2 | retention、索引、N+1、批量和多副本快照仍需生产基准 | Prisma schema、sync/event routes | query plan/负载/retention 证据进入矩阵 |

### CLI / daemon / runner

| ID | 等级 | 问题 | 主要证据 | 关闭标准 |
|---|---|---|---|---|
| CLI-SEC-001 | P1 | Closed：基线 loopback control server 五个 endpoint 无鉴权且 `spawn-session` 接受任意环境变量；现为每次 daemon 启动生成 256-bit Bearer token、state 0600、所有 endpoint 恒定时序校验，spawn env 仅允许终端/locale 显式白名单 | `daemon/controlServer.ts`、`controlClient.ts`、`run.ts`、`persistence.ts`、`ui/doctor.ts` | 五 endpoint 无/错 token 10 次均401，敏感 env 即使正确 token 仍400；真实 systemd daemon 无/错/正确 token=401/401/200，state token 43字符且0600，status/doctor 脱敏。CLI unit 83 files/669 tests、build 通过；runner 收养及三条8443连接保持 |
| CLI-REL-001 | P1 | 五类 runner 原先各自实现 signal/archive 退出，终态语义不一致 | 各 `run*.ts`、`sessionProtocol/RunnerShutdownCoordinator.ts`、`processSignalHandlers.ts`、`agent/acp/AcpBackend.ts`、`gemini/geminiBackendFailure.ts`、`agent/acp/runAcp.test.ts`、`openclaw/runOpenClaw.test.ts` | In Progress：Claude/Codex/Gemini/ACP/OpenClaw 均已接入统一幂等协调器和可清理 signal disposer；共享协调器基础与五 flavor×三阶段×五触发器契约 **75/75**，ACP runner fatal 1/1、真实 `opencode` 外部 backend SIGKILL→归档 1/1、OpenClaw active-turn fatal→failed turn-end→archive/session-end 1/1，Gemini ACP `status:error`→failed shutdown→archive 控制流新增定向回归（`runAcp + RunnerShutdownCoordinator` **2 files/24 tests，exit 0**）。所有 flavor 共享 archive/session-end/flush/close 顺序，AcpBackend 已修复 `code=null/signal=SIGKILL` 漏报；仍待真实 Gemini provider、五类 startup/idle/active 真实注入、跨平台及跨端 App RPC 观察 |
| CLI-REL-002 | P1 | stop-session 发 TERM 后立即删 tracking 并报告成功 | `daemon/run.ts:785`、`daemon/controlServer.ts`、`daemon/controlClient.ts`、`agenthub-wire/src/rpc.ts`、`daemon/doctor.ts` | In Progress：`running→stopping→exited/timeout` 已接入，SIGTERM 后保留 tracking、child exit/error 才移除，外部 PID 有限轮询，10 秒 timeout 后仅在确认超时升级 SIGKILL；control API、`/list` 和 Wire RPC 均显式保留 lifecycle state，CLI/API Machine 可观察 stopping。私有 bundle authenticated daemon 集成 14 项中 13 passed、1 skip，真实忽略 SIGTERM child 已确认 timeout、SIGKILL、tracking 清理与二次 timeout 查询；补齐 `/cli/bundle/dist/index.mjs` 进程识别并复跑 adoption 通过；仍待结构化归档及 App RPC 全链路展示 |
| CLI-REL-003 | P1 | daemon 1 秒 watchdog 可截断本地清理 | `daemon/run.ts`、`daemon/shutdownWatchdog.ts` | In Progress：先复现不可取消 timer，再以 `createShutdownWatchdog` 让 request 幂等、cleanup 成功可 cancel、超时只触发一次；专项 2/2、CLI unit 103 files/723 tests、typecheck/build/diff check 通过。新增 authenticated server process group SIGSTOP 慢 API 注入 1/1：daemon 在 3.94 秒内 watchdog 退出，日志可观察；仍需断网/外部 API 失败场景及跨平台证据 |
| CLI-REL-004 | P1 | Closed：基线 state heartbeat 原地截断覆盖、lock 仅保存PID、活PID+HTTP故障会删state、stop fallback可SIGKILL复用PID，旧owner释放可删后来者lock | `persistence.ts`、`daemon/processIdentity.ts`、`daemon/daemonOwnership.ts`、`controlClient.ts`、`controlServer.ts`、`utils/atomicPrivateJson.ts` | 每次启动独立owner nonce；Linux boot ID/start ticks/proc exe/cmdline digest，macOS ps lstart/command、Windows CIM creation/exe/cmdline身份；state临时文件fsync→rename→目录fsync，lock JSON fsync且nonce条件释放；控制响应绑定owner header。身份匹配时HTTP故障保留owner，身份不匹配才清stale且绝不信号，删除常规SIGKILL fallback。CLI 93 files/684 tests、隔离sleep PID reuse实测与真实systemd身份核验通过 |
| CLI-REL-005 | P1 | Codex app-server fatal 不立即驱动 runner 归档 | `codexAppServerClient.ts` process `error/exit` handlers、`codex/runCodex.ts` fatal hook、`agent/acp/AcpBackend.ts` | In Progress：先以 idle 退出测试复现 handler 缺失，再增加按 process epoch 幂等 `setFatalErrorHandler`，覆盖 pending RPC reject、active turn abort，并接入统一 `requestProcessShutdown`；client idle/active SIGKILL 注入 2/2、suite 15/15。真实 authenticated 私有 daemon 中 SIGKILL app-server 后已取得 runner 退出、daemon tracking 清理、服务端加密 session `active=false/thinking=false/archived/cli` 与 runner 日志证据；ACP 外部 `opencode` backend SIGKILL 真实 1/1 已通过，修复 signal exit `code=null` 漏报；仍需 Gemini 真实 fatal 矩阵及更高层 App RPC UI 观察 |
| CLI-REL-006 | P1 | bundle 仅 mtime 检测，无 staging/readiness/rollback | `daemon/run.ts`、`daemon/bundleSafety.ts` | In Progress：新增 sha256 指纹、`execFile` 语法检查与 `--version` smoke，启动保存整个 `dist` 的 0700/0600 previous bundle，候选失败目录级原子恢复并继续现有进程，拒绝 symlink candidate；专项 5/5、CLI unit 104 files/728 tests、typecheck/build/diff check 通过。仍需真实 heartbeat 损坏/import 和跨平台注入 |
| CLI-REL-007 | P1 | 终态 outbox 原先仅内存，离线退出会丢失 | `api/apiSession.ts`、`api/terminalOutboxJournal.ts`、`packages/agenthub-app/sources/sync/ops.ts`、`hooks/useSessionQuickActions.ts`、`daemon/run.ts`、daemon adoption integration | In Progress：已将已加密 `{content,localId}` 与 session-end marker 写入私有原子 journal，消息 ACK/重连/新实例可恢复；新增 session-end Socket.IO ack，客户端只有在服务端成功确认后才消费 marker，RED→GREEN 定向 2/2；POST 成功但 journal ACK 失败时内存 batch 保留；authenticated 真实 server 跨进程 integration 1/1、daemon adoption replay 1/1、POST 成功后崩溃 race 1/1；新增真实 adopted runner server 重启断线→重连 **1/1**，runner PID/lifecycle 保持、服务端 session 未归档且 active/thinking 状态恢复；真实 App 归档链已取得 GREEN：Daemon `stop-session`→authenticated server archive→Server `active=false/thinking=false`，集成 **1/1**；App 归档动作现优先使用 daemon structured stop，旧/离线 daemon 回退 `sessionKill`/server archive，专项 **11/11**、typecheck 通过；Daemon archive fallback 的独立失败注入和加密 lifecycle metadata 最终一致性仍开放。仍需更高层 App RPC stopping/exited/timeout→归档展示证据 |
| CLI-SEC-002 | P1 | Closed：基线 access.key/settings/sessions/daemon lock 与大量日志为0664，tmp/hooks为0775；logger 对任意嵌套对象、URL、Error和远程日志无系统脱敏，临时 Codex auth.json cleanup handle 丢失 | `configuration.ts`、`persistence.ts`、`ui/logger.ts`、`daemon/codexAuthHome.ts`、`daemon/sensitiveResource.ts`、OpenClaw/Gemini/hook 写入 | 启动时不跟随 symlink 递归修复私有树目录0700/文件0600，新写入显式mode并chmod；本地/控制台/远程统一递归脱敏敏感字段、Bearer、URL userinfo/query、Error、二进制与循环对象；临时 Codex home 0700/auth.json0600，禁用该场景tmux并在child exit/error恰好一次删除。CLI 88 files/677 tests、build/typecheck通过；真实HOME全树mode和当前日志凭据扫描通过 |

### 工程、依赖、发布与体验

| ID | 等级 | 问题 | 关闭标准 |
|---|---|---|---|
| ENG-CI-001 | P1 | GitLab/master 无仓库内 required CI；GitHub workflow 监听 main | master 每提交 required pipeline 全绿 |
| ENG-DEP-001 | P1 | 根 1199 dependencies 是传递树快照，掩盖漏声明 | 根无生产 dependencies，workspace 声明完整，严格安装通过 |
| ENG-ENV-001 | P1 | authenticated env 构建共享 CLI bundle并触发生产 daemon 重启 | In Progress：环境 manager 已改为 `envDir/cli/bundle` 私有 staging/原子替换，`AGENTHUB_CLI_ROOT`、物理 launcher 与绝对依赖链接均已接入。私有 bundle 与 staged-failure rollback 契约 7/7；真实 authenticated `env up --no-switch` 完成 42 migrations、server/web、credentials seed 与私有 daemon 注册，PID 2538574 的实际入口落在 `environments/.../cli/bundle/dist/index.mjs`；共享 dist hash `84d406...` 前后不变，清理后生产 daemon PID 2571067、runner PID 2072452/1687829 保持。新增 Web helper/启动预算/PATH resolver TDD **11/11**、环境文件 ESNext/Node typecheck 与 diff check 退出码 0；`vivid-forest` 与 `smooth-cloud` 真实 authenticated env 均完成 headless Web 监听、42 migrations、私有 bundle/seed/daemon，后者复用 PATH pnpm 避免 npx 网络等待，stop/remove 后生产 daemon PID 3293362、runner PID 2072452/1687829 与 8443 ESTAB 不变。新增 `runEnvironmentUpTransaction`，对 template/start/build/seed 三个阶段做故障注入，专项 **3/3**、环境完整 **21/21**；仍需长期日志压力及 Docker/release 门禁证据 |
| ENG-DKR-001 | P1 | In Progress：基线 Docker 使用旧 wire scope，context 包含本地状态/密钥/GB 产物；当前本地镜像、清单、签名准入与回滚子项已收敛 | Server/Redis/Web digest-pinned builder/runtime smoke、源码级context、非root/只读根、安全清单、CEL+Sigstore bundle策略、TLS鉴权registry签名正反向准入、External Secrets v1与精确digest rollback本地矩阵已通过；仍需protected GitLab OIDC、生产registry/Vault/cluster的keyless正向发布及跨平台证据 |
| ENG-REL-001 | P1 | release 控制面、分支、bundle ID、镜像和 manifest 漂移 | 单一 release:doctor/metadata:check 通过 |

2026-07-12 增补：已落地第一层可执行发布元数据契约（`scripts/releaseMetadata.ts`、根 `metadata:check`/`release:doctor`），并以 2 个测试覆盖当前仓库通过与版本漂移失败；该工具只读且适合 required CI，尚未把 release-it、制品 digest、SBOM/漏洞扫描及跨平台产物纳入，因此 ENG-REL-001 仍为 P1 In Progress。

2026-07-12 跨端验证增补：authenticated Web 能真实创建 Codex session 并渲染详情页，但点击“Move out of workspace”后未产生 archive 请求，Server 仍为 `active=true/thinking=false/lifecycleState=running`。证据存于 `docs/audits/evidence/2026-07-12-lifecycle/05-authenticated-web-archive-action-observation.json`，标记为 inconclusive-failure；该结果将 App archive action path 保持为开放 P1 观察项，不以单元测试通过替代真实 UI 证据。

2026-07-12 根因修复：legacy `sessionKill` 成功后现在强制调用 Server archive，archive 失败传播到 App，避免 kill 与 Server 生命周期分裂；定向 `ops.test.ts` 18/18、App 全量 179 files/1157 tests 通过。此前 authenticated Web 失败观察仍有效，必须重新进行真实 Web 验证后才能关闭跨端 P1。

2026-07-12 修复后真实验证：authenticated Web 通过键盘 Enter 激活归档动作后返回首页，Server 记录 `/v1/sessions/{id}/archive`，最终 `active=false/thinking=false`；证据为 `docs/audits/evidence/2026-07-12-lifecycle/06-authenticated-web-archive-action-fixed.json`。该项可关闭 legacy archive action 的跨端观察，但 provider 全矩阵、Gemini 真实 CLI 和 Phase 1 其余 P1 仍开放。

2026-07-12 Server 回归刷新：Server 全量 **33 files passed / 1 skipped，129 tests passed / 2 skipped，退出码 0**；`tsc --noEmit`、`git diff --check` 退出码均为 0。session cache archive/heartbeat race、session-end invalidation 与资源限制相关回归保持通过。

2026-07-12 Daemon 回归增补：修复 bundle 依赖 chunk 缺失时 ENOENT 被当作安装窗口、以及 state 早于 rollback snapshot 写入的竞态；同步修正 SIGSTOP cleanup integration 的启动时序断言。最终 authenticated daemon integration **23 passed / 1 skipped，退出码 0，230.77s**，覆盖 stop/timeout、adoption/journal/reconnect、bundle rollback、Codex/Claude/ACP fatal→archive；`bundleSafety.test.ts` 5/5、CLI typecheck/diff check 通过。跨平台 macOS/Windows 真实证据仍未取得。

2026-07-12 CLI unit 回归刷新：**109 files / 743 tests passed，退出码 0，54.74s**；daemon/runner/provider/journal/security 相关单测保持全绿。

2026-07-12 Gemini 运行时探针：CLI 包版本 0.50.0 可从 npm 获取，但主机无 `gemini` 可执行文件、无认证凭据，隔离真实 bundle probe 退出码 41 且 node-pty native runtime 不可用；证据 `docs/audits/evidence/2026-07-12-lifecycle/07-gemini-provider-availability.json`。因此仅保留 Gemini fatal 处理契约证据，未宣称真实 Provider startup/idle/active/fatal 完成。

2026-07-12 release metadata 漂移校正：`docs/project-status.md` CLI 版本从过时的 1.0.0 更新为实际 `packages/agenthub-cli/package.json` 的 1.0.3；`releaseMetadata.ts` 新增 CLI 文档版本契约。RED→GREEN `scripts/releaseMetadata.test.ts` **2/2**，JSON doctor 退出码 0，diff check 退出码 0。ENG-REL-001 仍需容器 digest、SBOM、平台制品和 required CI 门禁。

2026-07-12 release doctor 增强：同一 metadata doctor 新增三个 Dockerfile runtime `FROM` 的 sha256 digest 校验；缺失 Dockerfile fixture 先触发 RED，补齐 fixture 后 `scripts/releaseMetadata.test.ts` **2/2**、JSON doctor 退出码 0、diff check 退出码 0。该项只关闭 digest 漂移检测，不代表 SBOM/漏洞扫描或 required CI 已完成。

2026-07-12 digest 负向回归增强：补充 unpinned runtime image fixture，验证 doctor 对 Docker digest 缺失明确返回 `docker-digest`；`scripts/releaseMetadata.test.ts` 更新为 **3/3**，真实仓库 JSON doctor 与 diff check 仍退出码 0。

2026-07-12 SBOM 基线：新增 `scripts/generateSbom.cjs`，从 `pnpm-lock.yaml` 生成确定性 CycloneDX 1.5 JSON；fixture 测试 `node scripts/generateSbom.test.cjs` **1/1**，真实锁文件生成 **2267 components**、退出码 0。ENG-SC-001 由 Open 调整为 In Progress；漏洞/OSV、许可证、签名上传和 reachable 分析仍未完成。

2026-07-12 SBOM artifact：真实清单写入 `docs/audits/evidence/2026-07-12-supply-chain/agenthub.cdx.json`，格式 CycloneDX 1.5、2267 components、332347 bytes、权限 0600；JSON 解析与 `git diff --check` 通过。该 artifact 仅证明依赖可枚举，不证明漏洞或许可证门禁完成。

2026-07-12 CI SBOM job：`.gitlab-ci.yml` 新增 required `supply-chain:sbom` job，执行 SBOM fixture、生成 `reports/sbom/agenthub.cdx.json` 并声明 GitLab CycloneDX report；`scripts/supplyChainPolicy.test.ts` **4/4**。该配置尚未取得真实 GitLab MR/master pipeline 绿线，因此 ENG-CI-001 仍 In Progress。

2026-07-12 CI workspace coverage：required pipeline 新增 `server:test`、`wire:test`、`cli:unit` jobs，分别执行 Server test/build、Wire test/typecheck、CLI unit；CI 契约测试 `scripts/supplyChainPolicy.test.ts` **4/4**。仍需真实 GitLab pipeline、contract/pack/Docker/Web export 和安全扫描证据。

2026-07-12 CI 本地等价回归：Server **33/1 files/tests skipped，129/2 tests，退出码 0**；Wire **4 files/31 tests + typecheck**；CLI unit **109 files/743 tests，退出码 0，59.91s**；GitLab YAML 契约 4/4。该批次证明 job 命令在当前工作树可执行，但不替代真实 GitLab MR/master required pipeline。

2026-07-12 CI contract/pack 门禁：新增 required `contract:test`（Server protocol inventory + Wire v4Sync/RPC）和 `pack:check`（CLI pack dry-run）。本地 contract 定向回归 Server 5/5、Wire 11/11，CI YAML 契约 4/4；pack dry-run 尚需在可用 pnpm/GitLab runner 中取得真实 artifact 证据。

2026-07-12 pack 命令校正与真实验证：首次发现 pnpm 不支持 `pack --dry-run`，修正 CI 为真实 `pack --pack-destination reports/pack` 并上传 artifact；pinned pnpm 实际生成 `artsum-agenthub-1.0.3.tgz`，127946315 bytes，退出码 0。该失败先被保留为配置缺陷证据，修复后才记录通过；真实 GitLab pipeline 仍待验证。
| ENG-TST-001 | P2 | 基线 App 1 失败/57 skip，无 TSX/E2E，coverage provider 缺失；当前 unit 已全绿，coverage provider、基线与非下降门禁已建立 | 全绿、关键流程 E2E、coverage 非下降门禁 |
| ENG-SC-001 | P2 | 证据193已关闭生产许可证阻断；证据194又以独立frozen lock绑定四个Provider及41个包/平台归档SHA-512，固定Node22镜像并真实运行四个版本 | 保持许可证与完整性fail-closed；完成protected master、签名attestation、生产registry发布/安装与回滚及首次有效凭据Provider artifact |
| UX-A11Y-001 | P1 | In Progress：关键Tab/动作菜单/状态语义、320px Account、Artifact CRUD/网络恢复及Transfers非空/dialog/键盘边界已修复；全页面axe和Native辅助技术仍待闭环 | Web 键盘/axe 与 VoiceOver/TalkBack 验收 |
| UX-FLOW-001 | P2 | 首页 CTA 重复、主工作区空置、Device/Machine 不一致 | authenticated Web 桌面/移动回归通过 |
| UX-I18N-001 | P2 | In Progress：动态语言、Account、文件/传输、会话入口、Artifact CRUD、共享运行时copy、六类Appearance预览及会话thinking状态已进入default+10 locale；生产可达含Han文案清零，范围 23→9→3→2 仅余dev夹具和文档示例。Changelog英语/简中正文已精确选locale并按需分块，其他8 locale明确fallback英语；Native、其他动态状态与完整十locale视觉仍开放 | 全 locale 自动和视觉回归通过 |
| UX-SHARE-001 | P2 | 无正式 Share API、Universal/App Links 与安全分享边界 | 本地分享、认证深链；外部分享符合 E2EE capability 约束 |

### 2026-07-11 后续可靠性收口记录

`SessionStopStateRegistry` 已接入 daemon，在正常退出或 timeout 后以 60 秒有限窗口返回 `exited/timeout`；Wire、control server、ApiMachine 均保留状态枚举。该段记录当时的 CLI 100 files/716 tests、定向控制面 14/14、环境工具 6/6、ApiSession/Journal 定向 35/35、协调器契约矩阵 75/75、ACP runtime fatal 1/1、build/typecheck/diff check 和 authenticated daemon 私有 bundle 14 tests 中 13 passed、1 skipped 证据；当时四类 provider backend 阶段故障注入、结构化归档与 journal adoption 重放尚未满足关闭条件，后续状态以本审计末尾的 2026-07-12 记录为准。

本轮环境隔离与 CLI 回归补证（2026-07-12 01:07–01:31）：环境 manager 私有 bundle 与 staged-failure rollback 契约 7/7；真实 `env up --template authenticated-empty --no-switch`（merry-beacon）完成 42 migrations、server/web、credentials seed 与私有 daemon 注册，PID 2538574 的实际入口为 `environments/data/envs/merry-beacon/cli/bundle/dist/index.mjs`，`bin/agenthub.mjs` 为物理复制且 `AGENTHUB_CLI_ROOT` 指向私有树。共享 `packages/agenthub-cli/dist/index.mjs` hash `84d406...` 前后不变；环境 stop/remove 后 systemd daemon PID 2571067 重新收养 runner PID 2072452/1687829，8443 连接一致。CLI unit 100 files/716 tests 全部通过，build/typecheck 通过；测试与真实环境均已清理。ENG-ENV-001 仍只剩 commandUp 全事务故障注入、env doctor/prune/日志轮转及 Docker/release 门禁证据。

UI/UX 真实 Web 取证启动（2026-07-12）：在 authenticated Web `calm-star` 中完成首页、Start New Session、Devices、Settings 四个主要状态的桌面截图与可访问性快照，证据位于 `docs/audits/evidence/2026-07-12-ux/01-home-desktop.png`、`02-new-session.png`、`03-devices.png`、`04-settings.png`、`05-settings-lower.png`。当前确认 Amber Crystal 视觉系统、连接状态、设备列表和新建会话上下文层级一致；仍发现首页主 CTA 视觉权重偏弱/中心留白过大、底部导航及设备卡片主要依赖 generic clickable、图标命名和 selected 语义不足、Settings 长页在桌面视口存在折叠/滚动可见性问题。此轮仅取证未改产品逻辑，UX-A11Y-001、UX-FLOW-001、UX-I18N-001、UX-SHARE-001 继续保持开放，Phase 4 已进入证据收集而非完成状态。

UX-A11Y 最小修复与真实回归（2026-07-12）：新增 `packages/agenthub-app/sources/components/accessibilityProps.ts` 与 2 个单元测试，统一生成 button/tab role、label、selected/expanded/disabled 状态，并在 `TabBar`、`SidebarView`、`MainView`、`Item`、新建会话配置卡/agent-model-effort/advanced pills 接入；桌面 header/sidebar 关键动作目标尺寸提升至 44×44；新建会话发送按钮改用 locale key，移除该处硬编码中文。专项 helper 2/2、相关回归 4/4、App typecheck/diff check 全绿；随后 App 全量 JUnit 178 files/1144 tests、JUnit 1144/0/0，root `check`（7 workspace typecheck、Server guardrail 5/5、Wire 2/2）exit 0。authenticated Web 私有环境 `lush-island` 真实 DOM 已确认三项 Tab 输出 `aria-selected=false/true/false`，Tab 键焦点依次落在 Devices 与 Terminals；Settings 行与新建会话配置项均输出 button role，证据为 `docs/audits/evidence/2026-07-12-ux/07-home-a11y-final.png`、`08-devices-a11y-final.png`、`10-settings-a11y-final.png`、`11-new-session-a11y-final.png`。仍需 Devices 行内动作、更多页面状态、320px/Native 辅助技术和全量 axe/键盘矩阵，UX-A11Y-001 保持 In Progress。
UX-A11Y Devices 动作收口（2026-07-12）：真实回归发现 `Item` 外层 row button 与 Devices 右侧 Device Actions button 嵌套，浏览器报 `button cannot contain a nested button`。新增 `Item.rightElementInteractive` 与 `itemLayout.shouldSplitInteractiveItem`，仅对确有交互右元素的 row 将右侧内容提升为 sibling overlay；MachinesView 的设备/分组 action 统一 role/label/expanded，目标尺寸至少 44。布局专项 2/2、helper 2/2、App typecheck/diff check 通过；authenticated Web `agile-ember` 设备页 snapshot 显示独立 row button 与 Device Actions button，菜单 Open Details/Move to Group 均为 button，`agent-browser errors` 无 nested-button 错误，截图 `docs/audits/evidence/2026-07-12-ux/13-devices-actions-menu.png`。仍需顶部动作、分组动作和 Native/axe 全量矩阵，UX-A11Y-001 继续 In Progress。

Devices sibling 全量验证（2026-07-12 02:14–02:15）：App 全量 JUnit 179 files/1146 tests、JUnit 1146/0/0，root `check`（7 workspace typecheck、Server guardrail 5/5、Wire 2/2）exit 0；生产 systemd daemon PID 2655873 与两个 runner/8443 ESTAB 一致，临时 authenticated 环境和浏览器已清理。

CLI OpenClaw runner 终态补证（2026-07-12 02:21–02:25）：新增 `packages/agenthub-cli/src/openclaw/runOpenClaw.test.ts`，从真实 `runOpenClaw` 控制流在 active turn 注入 provider `status:error`，验证 `turn-start → turn-end(failed)`、`thinking=false`、metadata archive、session death、flush、close 与 backend dispose 均单次完成，定向 1/1；随后 CLI 定向 4 files/28 tests、全量 unit **102 files/719 tests**、CLI typecheck 与 diff check 均退出码 0。复核生产 systemd daemon PID 2655873、runner PID 2072452/1687829、三条 8443 ESTAB 均一致，未执行 CLI build。该证据仅收口 OpenClaw runner，Claude/Codex/Gemini 的 runner fatal 仍是 CLI-REL-001 未关闭项。

Codex app-server fatal 传播修复（2026-07-12 02:27–02:29）：`codexAppServerClient.test.ts` 先以 idle app-server exit 得到 RED，随后实现 `setFatalErrorHandler`，按 process epoch 过滤 stale/intentional disconnect，统一处理 `error/exit`，并在 `runCodex` 将 fatal 回调接入 `requestProcessShutdown('Codex app-server exited unexpectedly')`。idle/active SIGKILL 注入定向 **15/15** 通过，CLI typecheck/diff check 通过；真实 child SIGKILL、runner 归档和 App RPC 端到端仍待执行。

Codex fatal 修复构建与 daemon 收养（2026-07-12 02:31）：停止 systemd daemon 前已记录生产 runner/连接；`KillMode=process` 保留 PID 2072452/1687829，CLI build 退出码 0，重启后 systemd daemon PID 3046493 在日志中恢复 2 个 running session，control port 36965，两个 runner 与 daemon 均维持 8443 ESTAB。该证据验证新 bundle 的启动、收养和生产进程不变量，但尚未替代真实 app-server child SIGKILL 的故障注入。

Daemon shutdown watchdog 收口（2026-07-12 02:33–02:35）：新增 `daemon/shutdownWatchdog.ts` 与 2 个测试，先验证缺失模块 RED，再实现可取消/幂等 watchdog 并接入 `startDaemon`；CLI 全量 103 files/723 tests、typecheck/build/diff check 通过。停止/构建/重启后 daemon PID 3070711 收养两个既有 runner，8443 连接保持；真实断网或慢 API shutdown 仍需执行。

Daemon bundle 安全更新收口（2026-07-12 02:38–02:48）：新增 `daemon/bundleSafety.ts` 与 5 个测试，目录恢复测试暴露只备份入口的缺陷，symlink 测试暴露跟随链接的缺陷，均已修复；现在按整个 `dist` 目录做 0700/0600 原子备份/恢复，候选执行 `node --check` 与 `node bundle --version`，并接入 heartbeat。CLI 全量 104 files/728 tests、typecheck/build/diff check 通过；systemd 重启后 daemon PID 3154764 收养两个 runner，8443 连接保持。真实 heartbeat 损坏/import 注入仍未完成。

CLI-REL-006 真实 heartbeat 损坏注入（2026-07-12 02:52–02:53）：authenticated 私有环境 `tidy-pearl` 的私有 daemon 在 250ms heartbeat 下真实收到非法 `dist/index.mjs`，integration 用例 1/1 通过（整文件 15 tests 中 14 按筛选跳过），保持同一私有 daemon PID，恢复整个入口/chunk 目录并输出拒绝与恢复日志；环境已清理，生产 daemon PID 3154764 与两个 runner/8443 ESTAB 保持。真实 import 缺失和跨平台注入仍待完成。
CLI-REL-006 dependent chunk 缺失注入（2026-07-12 02:54–02:58）：首次运行暴露测试导入匹配正则错误并清理环境；修正后旧的入口单文件 hash 实现按预期 RED（删除私有 `dist` chunk 后未恢复），改为整个 bundle tree sha256 指纹后，`integration-authenticated ... -t "dependent chunk"` 1/1 通过（15 tests 中 14 按筛选跳过），私有 daemon 恢复缺失 chunk 并保持运行，环境 `snug-delta` 已清理，生产 daemon/runner 未受影响。当前仍需 symlink、跨平台及 App/RPC 观察证据。

CLI-REL-006 dependent chunk symlink 注入（2026-07-12 03:04–03:06）：authenticated 私有环境 `prime-atlas` 中先以真实 symlink 替换 dependent chunk，旧实现按预期 RED（21 秒超时且未回滚）；新增完整 tree readiness 检查和非 `ENOENT` 检查错误转入拒绝/恢复路径后，`integration-authenticated ... -t "dependent chunk becomes a symlink"` 1/1 通过（17 tests 中 16 按筛选跳过），环境 `true-dune` 清理。随后重新运行入口损坏（环境 `plush-aurora`）和 dependent chunk 缺失（环境 `grand-atlas`）各 1/1 通过；CLI unit 104 files/728 tests、typecheck、build 均退出码 0。systemd 停止→构建→启动保持 `KillMode=process`，daemon PID 3293362 收养 runner 2072452/1687829，8443 ESTAB；仍需跨平台和 App/RPC 观察证据。

CLI-REL-005 真实 Codex child fatal→归档（2026-07-12 03:18–03:19）：authenticated 私有环境 `plush-crater` 将 daemon heartbeat 设为 250ms，启动真实 terminal Codex runner（PID 3361117），定位真实 `codex app-server --listen stdio` 子进程（PID 3361387）后发送 SIGKILL；`integration-authenticated ... -t "real runner and session"` 1/1 通过。runner log 记录 process SIGKILL、`Codex app-server exited unexpectedly` 和统一 cleanup；daemon list 在 heartbeat 内移除 runner，服务端 `/v1/sessions/:id` 使用隔离凭据和持久加密 key 解密为 `active=false`、`thinking=false`、`lifecycleState=archived`、`archivedBy=cli`，环境已清理，生产 daemon 未受影响。

CLI-REL-007 daemon adoption journal replay（2026-07-12 03:43–03:50）：真实 daemon-spawned Claude session 在旧 daemon SIGTERM 后由新 daemon 以相同 runner PID 收养；向私有 0700/0600 journal 注入加密消息与 session-end marker，独立 `ApiSessionClient` child 重放后输出 `replayed:0:false`，journal 清空，服务端唯一 marker 仅一条且 session `active=false/thinking=false`。定向 integration 1/1、完整 daemon integration 19/20（1 skipped）、terminal journal integration 1/1、CLI unit 104 files/728 tests、typecheck/diff check 均通过；隔离环境已清理，生产 systemd daemon PID 3293362 与两个 runner/8443 ESTAB 保持。该证据收口 daemon adoption replay 子项，但 POST 成功后崩溃竞态、被收养 runner 自身断线/重连及 App RPC 观察仍保持开放。

CLI-REL-007 session-end ack 竞态收口（2026-07-12 08:00–08:05）：新增客户端 RED 测试，证明 connected socket 在未确认时立即消费 marker 会留下 `sessionEnd=undefined`；GREEN 后 `ApiSessionClient` 通过 Socket.IO ack 才消费 marker，服务端 `sessionUpdateHandler` 对成功/校验失败/异常返回 `success/error`。定向 `apiSession.test.ts -t session-end` **2/2**、CLI/Server typecheck exit 0；authenticated terminal journal cross-process **1/1**，环境已清理。POST 成功后进程崩溃、被收养 runner 断线/重连与 App RPC 仍开放。

CLI-REL-007 POST 成功后崩溃竞态（2026-07-12 08:08–08:10）：authenticated isolated-home 子进程向真实 server POST 成功后，在 `TerminalOutboxJournal.acknowledge` 前 SIGKILL；replacement child 从同一私有 journal 重放，服务端按 `localId` 去重且只保留一条消息，journal 清空。定向 integration **1/1**，环境已清理；被收养 runner 自身断线/重连及 App RPC 观察仍开放。

CLI-REL-001 Claude provider fatal→归档（2026-07-12 08:50–08:53）：先为 `claudeBackendFailure.ts` 增加 RED→GREEN **4/4**，覆盖 provider fatal、已有退出、无 handler 兼容重试和归档 handler 异常；随后将 `claudeRemoteLauncher` 的 SDK 异常通过 `loop` 传入 `runClaude` 的统一 `ShutdownCoordinator`，并记录脱敏的 `Backend fatal; archiving session`。authenticated 私有环境真实发送加密用户消息启动 Claude SDK，定位原生 Claude 子进程并 SIGKILL；真实集成 **1/1** 通过，runner 退出、daemon tracking 清理，服务端 session 解密为 `active=false`、`thinking=false`、`lifecycleState=archived`、`archivedBy=cli`，runner log 含 fatal 归档记录。随后 ACP 外部 `opencode` backend SIGKILL 真实集成 **1/1** 通过并修复 `code=null/signal=SIGKILL` 漏报；仍缺 Gemini 可用 provider 的真实 fatal、五 flavor 全阶段真实矩阵及 App RPC 展示证据。

CLI-REL-006/ENG-ENV systemd owner route（2026-07-12）：新增 `systemdSupervisor.ts`，检测到用户 unit 文件时，`ensureDaemonRunning` 只通过 `systemctl --user start agenthub-daemon.service` 启动，不再创建第二个 detached daemon；RED→GREEN `systemdSupervisor.test.ts` 1/1、ensure/install 相关 5/5，CLI typecheck、`pnpm check`、`git diff --check` 通过。真实 service detection=`true`，生产 systemd daemon 单实例、两个 runner 被收养、三条 8443 ESTAB；doctor stale-only 和 previous bundle 全失败注入仍开放。

CLI-REL-006 doctor clean 保护（2026-07-12）：`filterConfirmedStaleProcesses` 只清理当前 project root 下、且不属于当前 CLI/current owner daemon/active daemon session 的确认 stale 进程，避免误杀 systemd daemon、runner 或其他 environment。纯函数专项 **5/5**，源码 `tsx src/index.ts doctor clean` exit 0 并输出 `Cleaned up 0 runaway processes`；生产 daemon/runner/8443 不变量保持。

首轮 APP-PERF-002/003 authenticated Web 取证（2026-07-12 03:56–04:08）：隔离 `noble-bluff` 中真实创建并写入 10,000 条加密 session 消息（100×100 batches），authenticated Web `/session/:id` 真实分页/滚动到 `performance message 8228`；滚动容器 `scrollHeight=252100`、DOM 约 1,029–1,569、页面可见文本约 221、`performance.memory.usedJSHeapSize≈190,067,318`（约 181MiB），初始约 83MB；DOM 未随历史条数线性增长，截图 `docs/audits/evidence/2026-07-12-perf/02-session-10k-scroll.png`、CPU profile `02-session-scroll.cpuprofile`。真实机器文件页 31 项滚动后 DOM 保持 323、Heap 约 41–42MB，截图/profile 为 `01-machine-files-scrolled.png`/`01-machine-files-scroll.cpuprofile`。环境、server、私有 daemon、浏览器均已清理；首次 `env:up:authenticated` 因 Expo DevTools Linux SUID sandbox 失败，改用 `CI=1` 手动 Metro 完成取证。该轮仅为首轮有界 DOM/分页判断，完整 10k/Network/HAR/移动证据见下方 04:37–04:45 记录，APP-PERF-002/003 继续 In Progress。

ENG-ENV-001 Web headless 启动修复（2026-07-12 04:19–04:25）：`buildWebServiceEnv` 按 TDD 先失败后通过，环境专项 9/9；真实固定 pnpm 10.11.0 的 `env:up:authenticated` 创建 `vivid-forest`，完成 42 migrations、server 41245、Expo web 19007、私有 CLI bundle、credentials seed 与 daemon 注册，Metro 输出 `Web is listening`，未出现此前 Linux Chrome sandbox/SUID 错误。`env:down`/remove 后端口与私有进程均清理；生产 systemd daemon PID 3293362、runner PID 2072452/1687829 与三条 8443 ESTAB 不变。环境文件单点 ESNext/Node typecheck 退出码 0；根 tsc 误扫 `src-tauri/target` 二进制生成物仍是工程治理问题。该证据仅收口 ENG-ENV-001 的 Web 启动子项，事务故障注入、doctor/prune/日志轮转、Docker/release 门禁仍开放。

ENG-ENV-001 PATH pnpm 与冷启动预算修复（2026-07-12 04:26–04:36）：第二次真实 `env:up:authenticated` 暴露 Web 30 秒等待过短与 `npx pnpm` 网络 `SYN-SENT`；先为 `getWebStartupTimeoutMs`、PATH pnpm 复用补 RED，随后 GREEN，环境工具专项 11/11、环境文件 typecheck/diff check 退出码 0。默认启动预算 120s，`resolveRepositoryPackageManager` 优先复用 PATH pnpm、再 fallback pinned npx；真实 `smooth-cloud` 完成 server 43865、Web 19007、42 migrations、私有 bundle/seed/daemon，未出现 sandbox/网络等待，环境已清理。

APP-PERF-002/003 完整 authenticated Web 长会话（2026-07-12 04:37–04:45）：`smooth-cloud` 真实写入 10,000 条加密消息。桌面 Web 完整分页/滚动到 `performance message 1`，`scrollHeight=520100`、`scrollTop=519670`、DOM 943、Heap 259,465,214 bytes、Heap limit 4,395,630,592 bytes；Network 100 个 GET+100 个 OPTIONS（每次 limit=100）。移动视口 390×844 完整滚动到同一消息，DOM 1248，滚动峰值 Heap 856,735,118 bytes、最终 811,262,045 bytes；真实 composer 热更新 POST 200，页面可见 `hot update 1`，热更新 DOM 1176、`scrollHeight=520120`、Heap 500,355,987 bytes。截图 `docs/audits/evidence/2026-07-12-perf/03-session-10k-full-scroll.png`、`04-session-10k-mobile-full-scroll.png`。Heap 受 V8 GC 和开发 bundle 影响，release export/缩放分组头/独立 profile/权限离线 timeout 仍开放，APP-PERF-002/003 不关闭。

ENG-CI-001 根 TypeScript scope 收口（2026-07-12 05:00–05:03）：先新增 `scripts/rootTypecheckScope.test.ts`，在缺少 `exclude` 时按预期 RED；`tsconfig.json` 最小排除 `packages/agenthub-app/src-tauri/target` 后专项 **1/1**、根 `tsc --noEmit`、pinned `pnpm check` 均退出码 0，7 workspace typecheck、Server guardrail 5/5、Wire guardrail 2/2 通过。该修复只排除生成二进制目录，不改变包级 typecheck；GitLab 外部 pipeline、全包 unit/contract/pack/Docker/security scan 仍开放。

ENG-DKR-001 Docker scope/context、builder、runtime 非 root、digest 与 Kubernetes security boundary 收口（2026-07-12 05:07–06:08）：新增 `scripts/dockerBuildScope.test.ts`，先因三个 Dockerfile 使用旧 `@dckill/agenthub-wire`、`.dockerignore` 缺少本地产物、Web native install/公开 build arg、runtime 权限、K8s manifest 安全边界和浮动基础镜像而得到 RED，随后最小修复为 `@artsum/agenthub-wire`、排除 `.worktrees`/`.gitnexus`/`artifacts`/`environments`/build/coverage/reports/profile/log、Web `pnpm install --ignore-scripts` + 显式 root/App postinstall、公开 args `POSTHOG_PUBLIC_VALUE`/`REVENUE_CAT_PUBLIC_VALUE`、Node runtime `agenthub` UID/GID 10001、Nginx `nginx` 用户监听 8080、Deployment `runAsNonRoot`/UID/GID 10001、RuntimeDefault seccomp、drop ALL capabilities/禁止提权、Node 20/20-slim/20-alpine 与 Nginx Alpine 的 digest 固定。专项 **8/8**、`git diff --check` exit 0；三个 digest-pinned runtime target 真实构建 exit 0，standalone 隔离容器 `Config.User=agenthub`、`/data` 可写、迁移 42 项后 HTTP `/` 返回 200；Web `Config.User=nginx`、8080 隔离容器返回导出的 HTML；manifest YAML parse guardrail 通过（当前主机无 kubectl，未做集群 dry-run）。Web builder context 从首次约 **1.46GB** 降至 **172.20kB**，最终无 `SecretsUsedInArgOrEnv` 警告。验证期间出现的 registry 403/Node headers ECONNRESET 均在重试或本地缓存后通过；漏洞/SBOM、Kubernetes admission/跨平台发布 smoke 仍未关闭，ENG-DKR-001 保持 In Progress。

ENG-SC-001 依赖漏洞审计收口（2026-07-12）：直接升级生产直依赖并加入根级 `pnpm.overrides` 后，`pnpm audit --audit-level=high --json` 为 **0 critical、0 high、37 moderate、7 low**（2389 dependencies；命令仍因 lower severities 以 exit 1 结束）。`scripts/supplyChainPolicy.test.ts` **3/3**，`CI=1 pnpm install --frozen-lockfile --ignore-scripts` exit 0，根 `pnpm check` exit 0；ENG-SC-001 仍保持 Open，原因是 SBOM/扫描、reachable 分析和根依赖边界清理尚未完成。

CLI 全包回归与集成环境隔离补证（2026-07-12）：authenticated 项目已在串行文件执行下 **20 passed / 7 skipped**，修复了 `process.env`/活动环境互相覆盖的竞态，并让 bundle rollback 测试等待异步恢复日志。首轮全包曾出现 Codex/app-server 上下文测试收到空文本；进一步确认 Vitest integration project 仍按默认 fork 数创建空闲子进程后，将三个 integration project 的 `poolOptions.forks.minForks/maxForks` 固定为 1，并保留失败时事件诊断。随后 CLI 全包 `vitest` **107 files passed、4 skipped；753 tests passed、14 skipped**，`integration-empty` Codex 5/5 通过；相关隔离环境已清理，生产 systemd daemon 保持单实例、两个 runner 均被收养且三条 8443 ESTAB。

本轮阶段判定：当前回到 **Phase 1/可靠性与故障恢复收尾**；stop-session 正常/timeout、daemon adoption journal replay、session-end ack、POST 成功后崩溃竞态和 adopted runner server 重启断线→重连已取得真实证据，剩余集中在 Gemini/ACP/五类 provider 的真实故障矩阵及 App RPC/归档跨端证据闭环。后续 Phase 2 性能/架构、Phase 3 UX/分享/多语言和 Phase 4 CI/供应链/发布仍不可视为完成，不应标记为最终发布阶段。

## 5. 性能与体验基线

- 默认 Web export（2026-07-12 production fresh）：38,316,435 bytes；303 个 JS 文件 21,900,987 raw / 4,711,713 gzip；entry pair 12,963,795 raw / 2,889,464 gzip；非 JS 文件 16,415,448 bytes。机器可读记录见 `docs/audits/evidence/2026-07-12-perf/03-web-export-metrics.json`。生产 bundle 未包含 dev credential 环境变量或 dev route module marker，但保留受 `isDevelopment=false` 保护的 query parser 字面量。
- 目标第一阶段首屏 JS gzip 至少下降 50%，并记录相同命令、Node 版本、提交和产物清单。
- UI 优点：Amber Crystal 明暗一致，新建会话层级清楚，卡片与高密度工作台风格成熟。
- UI 缺口：首页三处 Start New Session、右侧空置、移动语言行换行、设置说明截断、语义与屏幕阅读器边界不完整。
- 分享必须分层：本地明确选择内容；无 secret/token/key 的认证深链；可选外部分享仅允许可撤销、限时限范围、服务端只存密文、key 在 URL fragment 的 capability。

2026-07-12 production Web export 复核：同一固定命令退出码 0，37,457,695 bytes、303 JS、21,042,247 raw/4,563,393 gzip；入口 pair 12,105,055 raw/2,740,323 gzip。相比前一基线下降约 2.24% 总量、5.16% 入口 gzip，但距离首阶段 50% gzip 预算仍有明显差距。生产产物未发现 dev credential 环境变量或 dev route module marker，仅保留 `isDevelopment=false` 保护的通用 query parser；机器证据见 `docs/audits/evidence/2026-07-12-perf/03-web-export-metrics.json`。该结果作为新鲜基线，不宣称性能项完成。

2026-07-12 App 归档错误边界复核：发现 `requestSessionArchiveStop` 原先将 daemon 已返回 `stopping/exited` 后的 server archive 失败吞掉并降级 `killSession`，会使客户端把未完成的服务端归档误认为成功。新增 RED→GREEN 测试并分离 machine RPC fallback 与 archive error propagation，补充 `exited→server archive` 成功路径；`ops.test.ts` 14/14、App TypeScript check、diff check 通过。该修复加强 App→Daemon→Server 终态一致性，但 authenticated Web 的真实状态渲染观察仍是开放项。

Gemini availability recheck（2026-07-12）：`command -v gemini` 仍无结果。Gemini 的真实 Provider fatal 证据继续标记为缺失，不以 fake executable、mock 或 skipped test 代替；在具备真实 CLI 与凭据的 CI runner 上执行 authenticated startup/idle/active 矩阵后才能关闭该项。

Gemini CLI/auth probe（2026-07-12）：npm registry 可获取 `@google/gemini-cli@0.50.0`，`--version` 真实退出码 0；隔离 HOME 执行真实 bundle 的 prompt 命令退出码 41，明确要求 `GEMINI_API_KEY`、Vertex 或 GCA auth，且当前缓存包缺少 node-pty 原生模块。当前阻断应记录为真实凭据/运行时缺失，而非 CLI 包不存在；仍不得将该 probe 当作 Provider fatal 通过证据。

Gemini ACP 控制流补证（2026-07-12 15:12）：新增 `runAcp.test.ts` 的 Gemini 专项回归，使用 ACP backend 的故障注入在 `status:error` 后验证统一 shutdown、metadata archived、session death、flush、close 与 backend dispose 均单次完成；与 `RunnerShutdownCoordinator.test.ts` 合计 **2 files/24 tests PASS，退出码 0**。这是不依赖外部凭据的 provider 控制流证据，不替代真实 Gemini CLI startup/idle/active/fatal 注入；真实 provider 仍因当前主机无 `gemini` 可执行文件和凭据保持开放。

CLI-REL-003 cleanup-on-server-failure（2026-07-12）：Daemon 原有 cleanup 在 `apiMachine.updateDaemonState` 遇到 Server/网络异常时会提前抛出，可能跳过 control server、state、caffeinate、lock 和 watchdog 清理。新增 `runDaemonCleanup`，所有步骤按 phase 独立捕获并继续，watchdog cancel 放在最终步骤；RED→GREEN `daemonCleanup.test.ts` 1/1，Daemon unit 18 files/41 tests、CLI typecheck、diff check 通过。断网/跨平台真实故障证据仍开放。

同批次验证治理：一次无意运行的 `vitest run src/daemon` 启动了 authenticated integration，主代理按进程治理要求记录现场、SIGTERM 终止测试进程并清理 `cool-crater` 环境；生产 systemd daemon、两个 runner 与 8443 连接未受影响。该误用批次不作为通过证据，后续仅使用 `--project unit src/daemon`。

CLI-REL-003 真实 Server outage cleanup（2026-07-12）：两次 authenticated 复测先暴露 private bundle 未更新及“cleanup step timeout 与 1s watchdog 同时到期”问题；修复为 cleanup 每步默认 250ms 有界超时，远程 API 超时后仍继续本地 state/lock/control cleanup。按 systemd 停止→构建→启动流程复核后，隔离环境 `agile-summit` 停止 Server 进程组并请求 daemon stop，真实集成 **1 passed / 23 skipped**，确认 daemon 退出、state/lock 删除和日志错误 phase；生产 daemon PID 2908275、两个 runner 收养关系及 8443 连接保持。该项的断网/Server outage Linux 证据已取得，跨平台证据仍开放。

CLI-REL-007 App lifecycle projection（2026-07-12）：将 quick-actions 与详情页重复的 archive 本地状态更新抽为 `applyArchiveStopProjection`，保留结构化生命周期：`stopping→archiveRequested`、`exited→exited`、Server fallback→`archived`，并保证 session/metadata 不可变。RED→GREEN 后 App 定向 2 files/35 tests、TypeScript check、diff check 通过；真实 authenticated Web 的 stopping/exited/archived 状态观察仍开放。

APP-REL-007 authenticated Web 真实观察（2026-07-12）：真实 authenticated Web 创建 session 后，直接 Server archive 返回 200 且 HTTP session projection 为 inactive，但 App 随后本地详情仍显示 `lifecycleState=running`/`active=true`；当前证据不能区分 Server 被 Runner 写回与 App 尚未刷新，因此不能宣称跨端终态通过。该结果仍支持必须从 Web action 执行 Daemon structured stop→Server archive→refresh 的验证方向。刷新页面不带 auth query 会进入登录页，确认 root secret 不持久化；截图与环境清理记录见验证矩阵。

SRV-REL-008 activity cache reactivation race（2026-07-12）：追踪确认 Server `ActivityCache` 的 30s validity cache 在 REST archive/Socket session-end 后仍保留，heartbeat flush 会无条件写 `active=true`；首轮 invalidate 后又补测发现下一次 DB 查询仍会接受 inactive 行，进一步补出 queue→flush 并发窗口和跨租户 invalidation 边界。新增 `invalidateSession(sessionId,userId)`，archive/session-end 成功后立即删除缓存，让 `isSessionValid` 查询与显式判定均要求 `active=true`，并将 heartbeat flush 改为 `where: { id, active: true }` 条件写。RED→GREEN `sessionCache.test.ts` 6/6、`sessionRoutes.test.ts` 5/5、`sessionUpdateHandler.test.ts` 1/1（3 files/12 tests）；最新完整 Server regression 33 files/129 tests 通过，2 skipped，typecheck/diff check 通过。该修复针对真实 Web 观察暴露的 Server 终态竞态和跨租户边界，Web 完整 action 收敛仍待重跑。

SRV-REL-008 real authenticated heartbeat race（2026-07-12）：隔离 `zesty-harbor` 中真实 HTTP 创建 session、真实 user-scoped Socket.IO heartbeat、REST archive、archive 后晚到 heartbeat 和 5 秒 flush 后 GET 查询全部执行；archive HTTP 200，最终 session `active=false/thinking=false`，脚本退出码 0。机器证据见 `docs/audits/evidence/2026-07-12-lifecycle/04-server-archive-heartbeat-race.json`，环境已清理。该证据关闭 Server reactivation race，但不替代 Web archive UI 的完整跨端观察。

WIRE-REL-001 protocol regression refresh（2026-07-12）：Wire 全量 4 files/31 tests 通过，typecheck/diff check 退出码 0；stop-session structured states、session protocol、message metadata 和 v4 sync contract 保持一致，App/CLI/Server 共享协议未漂移。

Phase 1 Server regression refresh（2026-07-12）：完整 Server Vitest **33 files passed / 1 skipped；127 tests passed / 2 skipped；退出码 0**，耗时 1.52s。API、Socket/RPC、presence、auth、encryption、rate/resource limits、KV、artifacts、machines 和 protocol inventory 均通过；2 个分布式 resource-limit integration 按环境策略 skipped，未计入最终发布 gate。

Phase 1 CLI unit regression refresh（2026-07-12）：`CI=1 ../../node_modules/.bin/vitest run --project unit` **109 files / 743 tests PASS**，退出码 0，耗时 57.35s；Daemon cleanup、Runner lifecycle、Codex/Claude/ACP/OpenClaw/Gemini contract、journal、security persistence 和 CLI 工具均纳入回归。

Phase 1 CLI unit regression refresh（2026-07-12 15:13）：同一命令在 Gemini ACP 专项新增后重新执行，退出码 **0**，**109 files/744 tests PASS**，耗时 40.15s；未发现 daemon/runner 回归。历史 743 tests 记录保留为前一批次证据，本次 744 为当前工作树新鲜计数。

Phase 1 CLI static/process refresh（2026-07-12 15:14）：CLI `tsc --noEmit` 与 `git diff --check` 均退出码 0；systemd daemon PID **485049**、版本 1.0.3，daemon-managed runner PID **2072452/1687829** 与 8443 websocket 均正常，未发现双 daemon 或逃逸 runner。本轮未执行 bundle build，避免无必要地扰动生产守护进程。

Phase 1 App RPC projection refresh（2026-07-12 15:16）：`sources/sync/ops.test.ts` **18/18 PASS**，覆盖 stopping/exited/timeout/not-found、Server archive fallback、失败传播与 projection；这强化了结构化状态边界，但仍不等同于 authenticated Web 中间态 stopping→exited 的真实时间序列证据。

ACP external backend fresh evidence（2026-07-12 15:17）：隔离 authenticated environment `brisk-beacon` 真实运行 `opencode` ACP backend，注入 backend SIGKILL；`daemon.integration.test.ts -t "archives the real ACP runner"` **1 passed/23 skipped，exit 0**，确认 runner 退出、daemon tracking 清理、Server `active=false/thinking=false`、加密 lifecycle `archived/archivedBy=cli`。环境和测试进程均清理，证据 `docs/audits/evidence/2026-07-12-lifecycle/08-acp-opencode-fatal.json`；生产 daemon/runner 不变量复核通过。该证据仍不替代 Gemini 真实 provider 和五 flavor 全矩阵。

Authenticated Web archive click recheck（2026-07-12）：`bright-ocean` 环境中真实创建会话并进入 `/session/:id/info`，可见 `Move out of workspace`；点击后本轮未形成 stopping/exited/archived 时间序列，保留为 **inconclusive**，证据 `docs/audits/evidence/2026-07-12-lifecycle/09-authenticated-web-archive-click-inconclusive.json`。这不是后端归档失败结论，也不能作为跨端通过证据；仍需确定性处理 Web click/confirmation 流程并重测。

Phase 1 App regression refresh（2026-07-12）：`CI=1 ../../node_modules/.bin/vitest run` **179 files / 1155 tests PASS**，退出码 0，耗时 3.82s；归档投影、session/storage/reducer、root-secret、Wire/i18n、Mermaid security、native QA、accessibility 和 Android/iOS guardrails 均通过，App typecheck/diff check 同批次通过。

ENG-CI-001 Web production export gate（2026-07-12 13:31–13:32）：新增 required `web:export` job，固定 production 环境变量，执行 Expo web export、`index.html` 存在性检查与 dev credential marker 扫描。本地等价导出退出码 0，三项检查均为 0；`scripts/supplyChainPolicy.test.ts` **4/4 PASS**，`git diff --check` 退出码 0，临时导出目录已清理。该证据不替代真实 GitLab required pipeline，也未关闭首屏 gzip 至少下降 50% 的性能预算。

ENG-SC-001 normalized audit gate（2026-07-12 13:36–13:38）：新增审计 JSON 归一化与 required CI 门禁。真实 pinned pnpm audit 记录 2389 dependencies、0 critical、0 high、37 moderate、7 low；原生命令因 moderate/low 退出码 1，但 `audit:check` 仅以 high 阈值判定并退出码 0，避免把低等级发现误报成命令失败或把 high/critical 隐藏。`audit:test` 3/3、CI policy 4/4、diff check 通过；artifact 为临时 `/tmp/agenthub-pnpm-audit-current.json`，CI 将持久化到 `reports/security/pnpm-audit.json`。许可证、reachable、签名/provenance 与真实 GitLab pipeline 仍开放。

ENG-SC-001 license gate（2026-07-12 13:40–13:42）：新增许可证清单生成与 SPDX/表达式归一化检查。真实清单 artifact `docs/audits/evidence/2026-07-12-supply-chain/licenses.json` 已生成并设为 0600；4 个包仍被 pnpm 标为 `Unknown`（Claude Agent SDK、Expo ngrok binaries、khroma），所以 license gate 明确退出码 1，required CI 会阻断发布。该失败是保护性结果，不得通过 allowlist 或关闭检查绕过；需取得上游许可证证据后再修复。

许可证证据复核（2026-07-12 13:43–13:46）：锁定版本的 Claude SDK tarball 含 Anthropic `LICENSE.md` 但属于非 SPDX 商业法律协议；Expo ngrok parent 缺少 license 字段、Linux x64 子包元数据显示 MIT；khroma@2.1.0 仍缺少可验证 LICENSE 文本。当前证据不足以将 Unknown 组安全映射为开放源代码许可证，因此保留 required CI 阻断。

ENG-SC-001 reachable audit：新增独立 advisory-path 检查器，不只依赖 audit metadata 总计。真实 pnpm audit 的 high/critical advisory 列表及 finding paths 均为空，证据 `docs/audits/evidence/2026-07-12-supply-chain/reachable-high-critical.json`，测试 3/3、CI policy 4/4、diff check 通过。该项可证明当前审计输入中的 reachable high/critical 为 0，但不覆盖未被审计源识别的许可证或供应链投毒风险。

ENG-DEP-001 root dependency boundary：根快照已从生产 `dependencies` 移到明确的 `devDependencies`，根 runtime dependencies 为空；冻结锁文件离线更新成功，boundary test 1/1。生产许可证清单改用 `pnpm licenses list --prod --json` 后，开发期 Expo ngrok 包不再进入生产审计，剩余 Claude SDK 与 Mermaid 的 khroma 仍因许可证证据不足阻断发布。

许可证 provenance 收口：精确 npm tarball 证据已证明 khroma@2.1.0 的 MIT 文本并记录 integrity/hash，`checkLicenses` 通过 provenance 映射将其从 unresolved 移除；Claude SDK 的 Anthropic proprietary terms 仍需明确法务/产品接受，不能按 SPDX 放行。当前 license gate 仍保护性失败，仅剩 `@anthropic-ai/claude-agent-sdk@0.2.96`。

SBOM provenance 收口：新增确定性 hash provenance 产物，绑定 commit、artifact path、字节数和 SHA-256；真实 SBOM 证据已生成并上传 required CI artifact。该机制提高制品可追溯性，但未冒充密码学签名；cosign/in-toto 与真实 GitLab pipeline 仍待完成。

根依赖边界回归：变更后 `pnpm check` 退出码 0，7 个 workspace typecheck、Server/Wire 协议 guardrail 与供应链 CI policy 均通过，未观察到由 root dependencies→devDependencies 分类调整造成的编译或协议回归。

Provenance 验证门禁：新增篡改/缺失/额外文件失败测试，并对真实 SBOM provenance 重算 SHA-256 得到 `valid=true`。CI 现在生成后立即验证 provenance；这提高完整性保障，但仍不等同于密码学签名或可信构建证明。

Release doctor 已纳入 CI/供应链门禁契约：缺少 SBOM、audit、license、Web export 或 provenance verifier 引用时负向 fixture 失败；真实仓库 doctor 与根 check 均通过。该检查只证明配置引用完整，真实 GitLab master pipeline 仍需外部执行证据。

新增 `ci:verify` 统一入口并在当前工作树执行成功，覆盖依赖边界、类型/协议 guardrail、SBOM/provenance、审计/reachability/license fixture、release doctor 和 CI policy；该入口不把未完成的真实 provider、Web/Native、Docker/K8s 或 GitLab pipeline 伪装成通过。

`ci:verify` 现额外执行 Docker/K8s 静态安全 guardrail（8/8），本地 pinned 入口仍退出码 0；容器漏洞扫描、Kubernetes admission 和真实 GitLab master pipeline 继续作为独立开放证据。

修复供应链 audit CI artifact 缺失：job 现在先生成原始 `pnpm-audit.json`，保留命令退出码 1（moderate/low）并由独立 high/reachability 门禁判定；本地复现结果为 raw=1、high/critical=0、两个门禁均 exit 0。

Audit job 现额外持久化 high/critical reachability 结论 JSON，与原始 pnpm 报告并列保存；该改动改善审计可追溯性，不把摘要当作完整漏洞扫描或许可证结论。

运行时治理复核：只读检查确认当前仅有一个 systemd 托管 daemon（PID 2908275）和两个被其管理、均保持 8443 websocket 的 Codex runner；无逃逸 runner/孤儿 daemon。该状态支持进程治理不变量，但不替代故障注入和跨平台测试。

已清理 `packages/agenthub-app/build` 的 1674 个 tracked 生成文件；`.gitignore`/`.dockerignore` 已覆盖该目录，并新增测试防止回归。清理后根 check 与统一 ci:verify 仍通过，避免将本地 native 构建物带入版本库和发布上下文。

根依赖边界已从“dev-only 快照”进一步收口为真正的最小工具清单：删除约 1199 项根声明，保留 6 个根脚本工具；冻结安装、root check、workspace typecheck 和 ci:verify 均在在线依赖可用条件下通过。

Release doctor 现在持续检查 root runtime 依赖为空且根 tooling 不超过 20 项；负向 fixture 5/5 通过，防止依赖快照回归。

根快照清理后再次完成本地 `ci:verify` 到 release/policy 阶段，确认 release doctor 与最小 root manifest 一致；真实 GitLab pipeline 仍需独立证据。

根快照删除后的 CLI unit 全量回归仍为 109 files/743 tests PASS，证明 CLI/Daemon/Runner 工具链在 workspace 精确依赖下可构建和测试。

CLI build 后 systemd daemon 按预期单实例重启为 PID 485049，两个既有 runner 保持收养与 8443 连接；未出现构建导致的双 daemon 或失联 runner。

根快照删除后的 App 全量回归为 179 files/1157 tests PASS；期间发现并修复 GitLab nightly policy 对 validate 脚本新增 boundary step 的过时断言。一次 npx 启动器无子进程卡住已按 SIGTERM 清理，不作为产品失败证据。

Server 在根快照删除后全量回归保持 33 files/129 tests PASS、2 skipped，服务端构建/测试依赖边界未回归。

Wire 在同一变更后 4 files/31 tests 全通过，协议构建和契约边界未回归。

Agent 包在根快照删除后 9 files/228 tests 全通过，认证和 CLI smoke 边界保持稳定；无凭据日志为预期测试输出。

Codium node/web TypeScript checks 在根快照删除后均通过，桌面与 Web 类型边界保持稳定。

环境治理新增只读 `env doctor`：通过配置、PID 格式和进程存活诊断发现 stale 环境，不自动清理或发信号；测试 13/13 通过。该能力为后续安全 prune 和日志轮转提供基础，但尚未声称环境治理完整。

环境 prune 已实现安全 dry-run/apply 分离：真实 dry-run 只报告 3 个 stale 候选，未删除任何环境；删除必须显式 `--apply` 且排除 current 环境。日志轮转仍未完成。

环境 prune dry-run 已固化为 0600 机器证据 `docs/audits/evidence/2026-07-12-environments/prune-dry-run.json`；当前工作树没有 current environment，候选 3 个，未执行删除。

`env prune --apply` 进一步要求 `AGENTHUB_ENV_PRUNE_CONFIRM=DELETE`，未显式确认时真实退出码 1 且不删除候选，降低误操作风险。

环境日志轮转已补齐：server/web 启动前按数量和字节预算淘汰最旧环境日志，测试 15/15 通过；systemd 生产 daemon 日志不受该逻辑影响。仍需发布配置和长期运行压力证据。

环境 doctor/prune/log rotation 测试已纳入统一 `ci:verify`，避免专项测试与最终门禁脱节；该入口仍不覆盖真实跨平台和长期运行压力场景。

修复后重新执行统一 `ci:verify`，pinned pnpm 退出码 0；该结果证明当前工作树的本地门禁链条一致，但不构成真实 GitLab、Docker 漏洞扫描、Provider 故障矩阵或最终发布验收通过。

Authenticated Web archive pointer pass（2026-07-12）：在 `brave-pearl` 中用真实 pointer down/up 触发 `Move out of workspace`，请求 `POST /v1/sessions/cmrhhf2he00588arjicwb5ps9/archive` 返回 200，页面从 `/info` 回到 `/`，Server 查询 `active=false/thinking=false`；环境和浏览器清理完成。证据 `docs/audits/evidence/2026-07-12-lifecycle/10-authenticated-web-archive-pointer-pass.json`。此前 programmatic DOM click 未触发 RN Web Pressable，归因于自动化事件模型，不作为产品失败；真实 pointer 与键盘 Enter 路径已通过。

Real stop timeout refresh（2026-07-12 15:43）：authenticated integration 在隔离环境 `prime-comet` 对真实 SIGTERM-ignoring external child 验证 `stopping→timeout`，并确认 force termination 后 terminal timeout 仍可查询；`1 passed/23 skipped，exit 0`，耗时 42.56s，环境已清理。证据 `docs/audits/evidence/2026-07-12-lifecycle/11-authenticated-stop-timeout.json`。这收口 daemon stop-session 中间态，但不替代 App UI 中间态和跨平台证据。

Gemini provider gate（2026-07-12 15:49）：将真实 Gemini ACP fatal→归档场景加入 authenticated daemon integration；当前主机无 `gemini` 可执行文件和凭据，clean retry 为 **1 file/25 tests skipped，exit 0**，CLI typecheck/diff check 通过。证据 `docs/audits/evidence/2026-07-12-lifecycle/12-gemini-provider-matrix-gate.json`；该 gate 只证明真实测试入口和 skip 条件，不能替代具备 CLI/凭据/node-pty 的 runner 上的真实 startup/idle/active/fatal 证据。

Gemini CI gate（2026-07-12）：新增 opt-in schedule-only GitLab job `cli:gemini-integration`，仅在 `AGENTHUB_PROVIDER_INTEGRATION=true` 时安装真实 `@google/gemini-cli@0.50.0`，要求受保护 `GEMINI_API_KEY`，运行真实 fatal test 并拒绝目标测试被 skipped；CI policy **4/4 PASS**、YAML parse 和 diff check 通过。本地没有凭据，故未执行该 job；真实 GitLab schedule 首次绿线仍是 ENG-CI-001 残余风险。

Final local `ci:verify` refresh（2026-07-12 15:57）：pinned 门禁全程通过，root boundary 2/2、environment 16/16、Docker 8/8、7 workspace typecheck、供应链/release policy 和 CI policy 4/4 均通过；该结果不替代真实 GitLab master/schedule 和 Gemini provider 执行证据。

OpenClaw live gateway refresh（2026-07-12 16:00）：authenticated integration 因本机 `ws://127.0.0.1:18789` 不可达而 **6 tests skipped，exit 0**，没有冒充 live gateway 通过；测试环境残留私有 daemon 已清理。证据 `docs/audits/evidence/2026-07-12-lifecycle/13-openclaw-gateway-availability.json`，真实 gateway/跨端 provider 证据仍开放。

Environment teardown hardening（2026-07-12）：真实 OpenClaw/Gemini integration setup 暴露了环境 daemon 在 SIGTERM 后被立即删除 state 目录、留下孤儿进程的缺陷。新增 RED→GREEN `waitForProcessExit` 测试 **2/2**，环境全量 **18/18 PASS**；teardown 现在先有界等待，超时后仅对隔离环境进程组升级 SIGKILL，生产 systemd daemon 不经过该 helper。`environments.ts` ES module typecheck 与 diff check 通过；后续 integration cleanup 未再观察到残留私有 daemon。

Final local gate after teardown hardening（2026-07-12 16:13）：pinned `ci:verify` 退出码 0；environment policy 18/18、7 workspace typecheck、Docker 8/8、供应链/release/CI policy 全部通过。结束后仅生产 systemd daemon 与两个受管 runner 存在，证明此次环境清理修复没有影响生产进程治理。

Real authenticated teardown（2026-07-12 16:14）：真实 `env:up:authenticated`→`env:down` 在 `lucid-garden` 中启动并停止私有 daemon PID 915072；down 退出码 0，私有 daemon 已退出，环境已移除，生产 systemd daemon/runner 保持不变。证据 `docs/audits/evidence/2026-07-12-environments/14-real-authenticated-teardown.json`。

Phase 1 CLI unit regression after Gemini gate（2026-07-12 15:52）：CLI unit **109 files/744 tests PASS，exit 0**，耗时 46.74s；新增 Gemini 集成入口未引入 unit 回归。测试前清理了一个孤立 `lush-atlas` 私有 daemon，随后生产 systemd daemon/两个 runner/8443 连接复核正常。

CLI-REL-002 authenticated stop-state timeline（2026-07-12 16:29–16:30）：隔离 authenticated server-only 环境 `bright-bluff` 中运行 stop-session 定向真实回归，**1 file / 2 passed / 23 skipped，退出码 0**。spawn 场景完整观察 `running→stopping→exited→tracking removed`，终态重查保持 `exited`，Server archive 后 `active=false/thinking=false`；不合作外部 PID 观察 `running→stopping→timeout→SIGKILL→tracking removed`，重复 stop 保持 `timeout`。证据 `docs/audits/evidence/2026-07-12-lifecycle/15-authenticated-stop-state-timeline.json`；环境、私有 daemon、临时进程已清理。CLI-REL-002 仅剩 macOS/Windows 跨平台证据。

Phase 1 authenticated daemon full gate（2026-07-12 16:32–16:36）：新隔离环境 `stout-mountain` 完整回归 **1 file / 23 passed / 2 skipped，退出码 0，234.16s**。覆盖 stop/timeout/stress、server 不可用清理、adoption/journal/reconnect、单 daemon/SIGTERM/SIGKILL、三类 bundle rollback、Codex/Claude/ACP fatal→archive；仅跳过显式 version-mismatch 与当前主机无 Gemini CLI 的真实用例。环境与私有 daemon 清理后，生产 systemd daemon PID 485049、runner 2072452/1687829、8443 ESTAB 不变量保持。证据 `docs/audits/evidence/2026-07-12-lifecycle/16-authenticated-daemon-full-gate.json`；Phase 1 Linux daemon gate 通过，但 Gemini/跨平台外部门槛仍开放。

SRV-SEC-003 key rotation and purpose isolation regression（2026-07-12 16:39）：密钥专项 **2 files/3 passed**，Server 全量 **33 files passed / 1 skipped；129 passed / 2 skipped**，TypeScript 与 diff check 均退出码 0。验证旧密文在轮换期可读、新密文无法由旧 key-only ring 解密、data/token purpose 复用在 production 被拒绝。证据 `docs/audits/evidence/2026-07-12-server/01-secret-rotation-purpose-isolation.json`；外部 Vault 真实轮换与 GitLab 历史扫描仍为开放证据。

ENG-CI-001 cross-platform lifecycle job contract（2026-07-12 16:42–16:44）：为 macOS/Windows 增加 schedule-only、protected runner tag、`allow_failure=false` 的 daemon stop/adoption/bundle lifecycle jobs，分别上传平台日志。先以策略测试得到 **1 failed**，配置完成后 `supplyChainPolicy.test.ts` + `releaseMetadata.test.ts` **2 files/9 tests PASS**，YAML parse、`metadata:check` 与 pinned `ci:verify` 均通过。证据 `docs/audits/evidence/2026-07-12-ci/17-platform-lifecycle-jobs.json`；尚未取得真实受保护 macOS/Windows runner 执行结果。

ENG-CI-001 release doctor platform gate（2026-07-12 16:45–16:47）：release metadata 现在强制要求 macOS/Windows lifecycle job；缺失 job 的负向测试先 **1 failed**，修复后 release/supply-chain 专项 **2 files/9 tests PASS**，`metadata:check ok=true`，pinned `ci:verify` 退出码 0。证据 `docs/audits/evidence/2026-07-12-ci/18-platform-release-doctor-gate.json`；真实 GitLab 保护规则与平台 runner 仍开放。

CLI-REL-001/005 + ENG-CI-001 Gemini release gate（2026-07-12 16:48–16:50）：release metadata 现在强制要求 `cli:gemini-integration`；缺失 job 的负向测试先 **1 failed**，修复后 release/supply-chain 专项 **2 files/9 tests PASS**，pinned `ci:verify` 退出码 0。证据 `docs/audits/evidence/2026-07-12-ci/19-gemini-release-doctor-gate.json`；真实 Gemini CLI/凭据 runner 尚未执行，不能视为 Provider 通过。

CLI-REL-007 not-found structured stop projection（2026-07-12 16:53）：ApiMachine 原先把 daemon `success=false,state=not-found` 转为 RPC `INTERNAL_ERROR`，App 可能错误降级 legacy kill；先以加密 RPC 测试得到 RED，随后允许 `not-found` 作为结构化终态并继续 Server archive。CLI 定向 **1 file/5 passed**、App ops **1 file/18 passed**、CLI unit **109 files/745 tests passed**，typecheck/diff check 通过。证据 `docs/audits/evidence/2026-07-12-lifecycle/20-not-found-rpc-projection.json`；尚需 authenticated Web/App 中间态和跨平台证据。

Phase 1 local full regression（2026-07-12 16:58–16:59）：统一回归 App **179 files/1157 passed**、Server **33 files/129 passed（2 skipped）**、CLI **109 files/745 passed**、Agent **9 files/228 passed**、Wire **4 files/31 passed**，pinned `ci:verify` 退出码 0，生产 daemon/runner 不变量保持。裸 pnpm 的 PATH 失败已按 pinned invocation 重跑成功，不计作代码失败。证据 `docs/audits/evidence/2026-07-12-regression/21-phase1-local-full-regression.json`；外部 Gemini、跨平台、Native 和 Vault/GitLab 门槛仍开放。

UX-A11Y-001 / CLI-REL-007 lifecycle badge implementation and Web observation（2026-07-12 17:04–17:09）：新增 Session Header Amber Crystal lifecycle pill，纯映射测试 6/6、App typecheck 和全量 **180 files/1163 tests** 通过；覆盖 archiveRequested/exited/timeout/not-found/archived，沿用现有多语言文案并提供 accessibility label。真实 authenticated Web 创建 session 并完成 Server archive API 200；随后使用 `agent-browser open` 重新打开无凭据 URL 属于硬刷新，因 root secret 仅驻留内存而显示登录页，这是预期安全行为，不是认证回归。证据 `22-session-lifecycle-badge-web-observation.json` 已校正解释；仍需同文档 SPA 导航下的稳定 badge 截图及 Native/全量无障碍证据。

CLI-REL-001/005 ACP external backend fresh evidence（2026-07-12 17:24–17:26）：在隔离 authenticated 环境 `clever-cloud` 中执行 `CI=1 npx -y pnpm@10.11.0 exec vitest run --project integration-authenticated src/daemon/daemon.integration.test.ts -t 'archives the real ACP runner when its external opencode backend is SIGKILLed' --reporter=verbose`，**1 passed / 24 skipped，退出码 0，62.42s**。真实 `opencode` backend 收到 SIGKILL 后，runner 退出、daemon tracking 清理、Server `active=false/thinking=false`、加密 lifecycle `archived/archivedBy=cli` 均通过；隔离 server/daemon/environment 已清理，生产 systemd daemon PID 485049、runner 2072452/1687829 和 8443 连接保持不变量。证据 `docs/audits/evidence/2026-07-12-lifecycle/08-acp-opencode-fatal.json`；Gemini 真实 provider、五类 runner 全 startup/idle/active 矩阵和跨端 App RPC 观察仍开放。

UX-A11Y-001 / CLI-REL-007 authenticated SPA lifecycle projection（2026-07-12 17:27–17:31）：`cool-canyon` 真实 authenticated Web 创建 session，并通过同文档 `pushState` 保持内存认证；Server archive API 返回 200，硬刷新无凭据回登录页符合安全策略，但直接 Server archive 后聊天头仍未稳定暴露 archived pill，证据 `docs/audits/evidence/2026-07-12-ux/23-session-lifecycle-spa-projection.json` 标记 inconclusive。该结果不改变 root secret 内存策略，反而明确指出需要使用正常 `requestSessionArchiveStop` 投影链路或补一次 metadata refresh 后再验 UI；浏览器、环境和私有 daemon 已清理。

Phase 1 provider/App contract refresh（2026-07-12 17:34–17:36）：CLI 五个 provider/runner 单元文件 **46/46 PASS**，App ops/lifecycle **24/24 PASS**，App typecheck 与 diff check 退出码 0；证据 `docs/audits/evidence/2026-07-12-lifecycle/24-phase1-provider-contract-refresh.json`。本机无 Android/iOS 工具链和 Gemini CLI/凭据，相关真实门槛继续开放。

CLI-REL-002/CLI-REL-005 fresh authenticated daemon gate（2026-07-12 17:37–17:41）：在清理上一轮 Web 环境遗留的 3 个脱离 daemon list 的私有 Codex runner 后，重新执行完整 authenticated daemon suite；**1 file / 23 passed / 2 skipped，退出码 0，242.54s**。覆盖 stop/timeout/stress、server unavailable cleanup、adoption/journal/reconnect、SIGTERM/SIGKILL、bundle rollback、Codex/Claude/ACP fatal→archive；`deft-dune` 环境已移除，孤儿 runner=0，生产 systemd daemon/两个 runner/8443 连接不变量保持。证据 `docs/audits/evidence/2026-07-12-lifecycle/25-authenticated-daemon-full-gate-refresh.json`；该证据收口 Linux authenticated daemon gate 的新鲜回归，但不关闭 Gemini、Native、跨平台、App UI 和外部 CI 门槛。

ENG-ENV-001 isolated runner teardown hardening（2026-07-12 17:45–17:48）：真实 Web 验证暴露环境 manager 只终止 daemon、不终止其 detached runner 的缺陷。先补 RED fixture，随后实现隔离环境专用 `stopEnvironmentDaemonSessions`，在 daemon teardown 前通过私有控制面逐个 `stop-session`；环境测试 **22/22 PASS**、环境 TypeScript/diff check 退出码 0。真实 `keen-coral` 启动 authenticated server/Web/private daemon 与 opencode ACP runner，执行 `env:down` 后再 remove，未遗留环境 runner/opencode 进程，证据 `docs/audits/evidence/2026-07-12-environments/26-isolated-runner-teardown.json`。该 helper 不触碰生产 systemd daemon；runner 忽略 stop-session 的极端场景仍由现有有界超时/升级路径兜底。

ENG-ENV-001 teardown convergence refinement（2026-07-12 17:52）：将隔离 runner 清理从“仅请求 stop”强化为“请求 stop 后有界轮询 daemon tracking 直到为空”；新增 fixture 验证 `stopping→tracking removed`，环境 manager 全量 **22/22 PASS**，TypeScript/diff check 退出码 0。该轮不重复启动生产 daemon，真实 `keen-coral` 结果和进程清理证据继续由 `26-isolated-runner-teardown.json` 记录。

ENG-ENV-001/ENG-CI-001 pinned ci:verify refresh（2026-07-12 17:53–17:54）：环境 teardown 收敛修复后执行 pinned `ci:verify`，退出码 **0**；7 workspace typecheck、environment 22/22、Docker 8/8、SBOM/provenance/audit/reachability/license、metadata 和 supply-chain policy 全部通过。证据 `docs/audits/evidence/2026-07-12-ci/27-ci-verify-after-environment-teardown.json`；生产 systemd daemon 与两个 runner 保持单实例/收养/8443 连接不变量。

ENG-ENV-001 log rotation input hardening（2026-07-12 18:29–18:30）：日志轮转接口新增参数契约，拒绝负数/非整数 `maxFiles` 与负数/非有限 `maxBytes`，避免错误发布配置静默删除全部历史日志。先以 RED 测试复现无异常，再最小修复为 `RangeError`，`env:policy` **1 file / 23 tests PASS，退出码 0**；证据 `docs/audits/evidence/2026-07-12-environments/27-log-rotation-input-guard.json`。该修复提升环境治理健壮性，但长期日志压力、跨平台文件系统和真实 GitLab/Docker 发布证据仍开放。

CLI-REL-007/UX-A11Y-001 authenticated Web action convergence（2026-07-12 18:36–18:39）：在隔离 `gentle-ocean` 中真实创建 Codex session，打开 Details 并将 Quick Actions 滚动到可视区，使用物理 pointer down/up 激活 `Move out of workspace`；浏览器返回工作区列表，Server 查询确认 `active=false`、`thinking=false`。截图与摘要证据为 `docs/audits/evidence/2026-07-12-ux/24-session-archive-home.json`，环境 down、浏览器关闭退出码均为 0；生产 systemd daemon PID **1348150**、runner **2072452/1687829** 和 8443 ESTAB 连接复核一致。该轮证明用户操作到 Server projection 的闭环，但归档 session 从 active workspace 移除，仍不能证明同一路由持续显示 archived badge 或 stopping/exited 中间态，Phase 1 继续 In Progress。

CLI-REL-001 fresh Codex fatal evidence（2026-07-12 18:41）：在隔离 authenticated daemon 环境 `gentle-coral` 中运行真实 Codex runner，SIGKILL 其真实 app-server 子进程；定向 integration **1 passed / 25 skipped，退出码 0**。Runner 退出并从 daemon tracking 移除，Server `active=false/thinking=false`，加密 lifecycle metadata 为 `archived/archivedBy=cli`，archive reason 包含 `Codex app-server exited unexpectedly`。环境已移除，生产 daemon/两个受管 runner/8443 连接不变量复核一致；证据 `docs/audits/evidence/2026-07-12-lifecycle/29-codex-real-app-server-fatal-refresh.json`。该证据只刷新 Codex active fatal 子矩阵，不替代 Gemini、idle/startup 全矩阵或跨平台证据。

CLI-REL-007 App stale-refresh lifecycle guard（2026-07-12 18:45–18:47）：先以 RED 测试复现 Server 较旧的 `running/active` 快照覆盖本地较新的 `archiveRequested/inactive` 投影；GREEN 为生命周期投影写入 `lifecycleStateSince`，storage 合并仅允许时间更晚的快照覆盖，并保留 terminal active/thinking/archive 字段。定向 **2 files/26 tests PASS**，App 全量 **181 files/1166 tests PASS**，typecheck 与 diff check 退出码 0；证据 `docs/audits/evidence/2026-07-12-lifecycle/30-app-refresh-lifecycle-guard.json`。该修复闭合一个本地状态竞态，但真实 Native 中间态和跨平台 provider 证据仍开放。

CLI-REL-007 equal-timestamp lifecycle guard（2026-07-12 19:13–19:14）：补充 RED 测试复现本地与 Server 生命周期时间戳相等时的非确定性覆盖；GREEN 将 storage 合并条件改为“只有严格更晚的 incoming timestamp 才覆盖”，本地归档投影在相等时间戳下保持优先。定向 **2 files/27 tests PASS**、App 全量 **181 files/1167 tests PASS**、typecheck 退出码 0；证据 `docs/audits/evidence/2026-07-12-lifecycle/31-app-lifecycle-equal-timestamp-guard.json`。

CLI-REL-007 newer Server terminal convergence（2026-07-12 19:30）：补充 Server `archived` 严格更晚时覆盖本地 `archiveRequested` 的回归，确认 `archivedBy/archiveReason` 不丢失；定向 1/1、App 全量 **181 files/1168 tests PASS**、typecheck/diff check 退出码 0，证据 `docs/audits/evidence/2026-07-12-lifecycle/32-app-newer-server-terminal-convergence.json`。

CLI-REL-001/ENG-CI-001 full Provider matrix gate（2026-07-12 18:51–18:54）：发现 release doctor 只要求 Gemini 单项 gate，先补 RED 断言后新增 `cli:provider-matrix` schedule-only job。该 job 在受保护变量存在时强制 Codex/Claude/OpenCode/Gemini 可执行文件、Gemini/OpenClaw credential，运行真实 runner fatal/idle 及 OpenClaw live gateway 集成，并将 skip 视为失败；release metadata/supply-chain **2 files/9 tests PASS**，`releaseMetadata --json` `ok=true`。证据 `docs/audits/evidence/2026-07-12-ci/32-provider-matrix-release-gate.json`。这提升了证据门禁但不替代真实 GitLab runner 首次绿线。

ENG-CI-001 provider-output verifier（2026-07-12 18:59–19:00）：shell grep 对 Vitest 聚合 skip 计数过于脆弱，先补 RED 后新增 `scripts/checkProviderMatrixOutput.cjs`，逐个验证五个真实 runner 场景的成功/跳过/矛盾状态；本地 verifier **3/3**、release metadata + supply-chain **2 files/9 tests** 全部通过，CI job 已改为调用 verifier。证据 `docs/audits/evidence/2026-07-12-ci/34-provider-output-verifier.json`。真实受保护 matrix runner 仍待执行。

ENG-CI-001 provider runner tag contract（2026-07-12 19:03–19:04）：发现 Provider matrix 默认继承通用 Node 镜像、无法保证 Codex/Claude/OpenCode 预装；先补 RED 契约后为 `cli:provider-matrix` 加入受保护 `provider-matrix` runner tag，要求专用预构建 runner 镜像并仍在 job 内检查 executable。CI policy/release metadata **2 files/9 tests PASS**，diff check 退出码 0；证据 `docs/audits/evidence/2026-07-12-ci/36-provider-runner-tag-contract.json`。真实 GitLab runner/tag/image 仍需外部配置与首次绿线。

ENG-CI-001 provider matrix failure artifacts（2026-07-12 19:08–19:11）：先补 RED 证明缺少 `artifacts.when=always` 会使 Provider matrix 失败时丢失诊断日志；GREEN 强制 `allow_failure=false`、always retention 和 runner/OpenClaw 两份日志 artifact。CI policy/release metadata **2 files/9 tests PASS**，pinned `ci:verify` `exit 0`；证据 `docs/audits/evidence/2026-07-12-ci/38-ci-verify-provider-artifacts.json`。真实 GitLab 失败 job artifact 保留仍需外部验证。

ENG-CI-001 provider CLI version pins（2026-07-12 19:20–19:22）：先以 RED 复现 Provider matrix 只检查 executable、未固定安装来源；GREEN 在受保护 job 中固定安装 `@openai/codex@0.144.1`、`@anthropic-ai/claude-code@2.1.207`、`opencode-ai@1.17.18`、`@google/gemini-cli@0.50.0`，policy/release metadata **2 files/9 tests PASS**、diff check 退出码 0。版本与 npm bin metadata 证据见 `docs/audits/evidence/2026-07-12-ci/40-provider-cli-version-pins.json`；真实 runner 原生依赖/凭据仍待执行。

ENG-CI-001 Gemini artifact retention regression（2026-07-12 19:26）：复核发现 Gemini 单项 job 曾缺失 `artifacts.when=always`，先补 RED 后恢复 always retention，并补 policy 断言 `allow_failure=false` 与 `reports/provider/gemini.log` 路径；CI policy/release metadata **2 files/9 tests PASS**，证据 `docs/audits/evidence/2026-07-12-ci/42-gemini-artifact-retention-regression.json`。该修复防止真实 Gemini gate 失败时丢失诊断日志。

CLI-REL-001/CLI-REL-002/CLI-REL-005 ACP idle stop（2026-07-12 17:59–18:00）：新增真实 authenticated `opencode ACP` idle runner stop-session 集成测试。首次断言错误导致 **1 failed**（实现返回标准 `Received SIGTERM`），修正后 **1 passed / 25 skipped，退出码 0，70.05s**；runner 退出、tracking 清理、Server `active=false/thinking=false`、加密 lifecycle `archived/archivedBy=cli` 通过，环境与孤儿进程已清理。证据 `docs/audits/evidence/2026-07-12-lifecycle/28-acp-idle-stop-session.json`；Gemini 与五 flavor 全真实矩阵仍开放。

CLI-REL-001/CLI-REL-002/CLI-REL-005 full authenticated daemon gate with ACP idle（2026-07-12 18:04）：在新增真实 ACP idle stop-session 测试后重跑完整 daemon suite，**1 file / 24 passed / 2 skipped，退出码 0，259.27s**；所有 Linux stop/timeout/adoption/journal/reconnect/bundle/provider fatal 场景及 idle archive 均通过。`vivid-cedar` 环境、server、私有 daemon、runner 已清理，生产 systemd daemon/两个 runner/8443 不变量保持。证据 `docs/audits/evidence/2026-07-12-lifecycle/29-authenticated-daemon-gate-with-acp-idle.json`。

Phase 1 local full regression after ACP idle（2026-07-12 18:10–18:13）：App **180/1163**、Server **33 files/129 tests（2 skipped）**、Agent **9/228**、Wire **4/31**、CLI unit **109/745** 全部通过，pinned `ci:verify` 退出码 0；生产 systemd daemon/两个 runner 与 8443 连接保持。证据 `docs/audits/evidence/2026-07-12-regression/30-local-full-regression-after-acp-idle.json`；该本地 gate 不替代 Gemini、Native、跨平台、真实 GitLab/Vault 和最终发布 gate。

ENG-SC-001 current audit refresh（2026-07-12 18:25）：当前 lockfile **2303 dependencies，0 critical/0 high/37 moderate/7 low**；threshold=high 与 reachable high/critical policy 均退出码 0。原始 pnpm audit 退出码 1 仅表示有可用升级 action，未将其冒充为漏洞门禁通过。证据 `docs/audits/evidence/2026-07-12-supply-chain/33-current-audit-reachability.json`；SBOM 签名/上传、OSV 外部扫描、许可证 provenance 和 CI artifact 仍开放。

## 6. 完成判定

审计项只在验证矩阵具有当前提交的新鲜命令、退出码、测试计数和所需运行证据时关闭。最终要求 P0/P1 清零；P2 完成或具有明确负责人、期限和接受理由；reachable high/critical 依赖为零；GitLab/master required CI 全绿；故障恢复、性能、无障碍、分享、多语言、发布及文档一致性全部验证。
### 2026-07-14 Phase 1 可靠性复核

- **CLI-REL-002/003/006/007（P1，Linux authenticated 回归证据增强）**：隔离环境 `lush-aurora` 的 daemon integration 长套件以 `CI=1 ../../node_modules/.bin/vitest run --project integration-authenticated src/daemon/daemon.integration.test.ts` 执行，结果为 26 tests、24 passed、2 skipped、退出码 0、248.82s。覆盖 stop-session 状态机、timeout/强制终止、本地清理超时、adoption/journal/reconnect、bundle 原子回滚及 Codex/Claude/ACP fatal 与 idle ACP 归档。源码证据为 `packages/agenthub-cli/src/daemon/daemon.integration.test.ts`、`src/daemon/bundleSafety.ts`、`src/daemon/sessionStopState.ts`、`src/daemon/terminalOutboxJournal.ts`；机器证据为 `docs/audits/evidence/2026-07-14-lifecycle/46-authenticated-daemon-full-regression.json`。生产 systemd daemon 单实例及两个 runner/8443 连接复核通过。
- **剩余条件**：本证据只覆盖 Linux authenticated 环境；Gemini CLI/凭据、五类 runner 的 startup/idle/active 真实全矩阵、macOS/Windows、App stopping/exited 中间态和真实 GitLab protected runner 仍未满足发布阻断条件。

### 2026-07-14 日志压力复核

- **ENG-ENV-001（P1，长期日志压力证据增强）**：在临时目录生成 512 个 64KiB 日志，总量约 32MiB；`rotateEnvironmentLogs` 在 20 文件/1MiB 双预算下删除 496 个，保留 16 个且总字节精确为 1MiB，退出码 0。证据 `docs/audits/evidence/2026-07-14-environments/47-long-log-pressure.json`。该验证不触碰生产 daemon，但跨平台文件系统与真实长期写入仍需 CI/运维环境证据。

### 2026-07-14 App RPC 生命周期时间序列

- **CLI-REL-007（P1，结构化状态观察增强）**：新增 authenticated daemon integration 用受控外部 child 捕获 `running → stopping → exited`，stop-session 首次返回 `stopping`，tracking 清除后再次查询返回 `exited`，时间戳单调。隔离环境测试 **1 passed / 26 skipped，exit 0**；App 生命周期定向 **2 files/28 tests PASS**、CLI typecheck exit 0。证据 `docs/audits/evidence/2026-07-14-lifecycle/48-app-rpc-stop-timeline.json`。这证明 daemon/App RPC 合同，但不替代真实 Web UI、timeout 中间态或跨平台证据。
- **回归结果**：加入时间序列测试后完整 authenticated daemon suite 为 **25 passed / 2 skipped，exit 0，27 tests，250.56s**；生产 systemd/runner 不变量保持。证据 `docs/audits/evidence/2026-07-14-lifecycle/49-authenticated-daemon-regression-after-timeline.json`。

### 2026-07-14 Gemini Provider fatal 复核

- **CLI-REL-001/005（P1，真实 Gemini fatal 子项）**：临时安装 pinned `@google/gemini-cli@0.50.0`，在 authenticated 隔离环境启动真实 Gemini ACP runner，定位真实 backend 子进程并 SIGKILL。首轮测试暴露归档原因大小写漂移（`gemini backend`），先补单元失败断言，再将通用 ACP 的 Gemini provider label 规范为 `Gemini`；单元 GREEN **1/1**，真实集成 **1 passed / 26 skipped，exit 0**。Server active/thinking 终态、加密 archive metadata 和进程清理均通过。证据 `docs/audits/evidence/2026-07-14-lifecycle/50-gemini-real-provider-fatal.json`。
- **限制**：本次只使用无效 API key 触发真实进程故障注入，证明 fatal→归档链路，不证明有效 Gemini API 请求成功；有效凭据下的 startup/idle/active 矩阵仍需受保护 CI runner。
- **完整回归**：注入 Gemini CLI 后完整 authenticated daemon suite 为 **26 passed / 1 skipped，27 tests，exit 0，257.20s**；唯一 skip 是显式 version-mismatch，所有 Provider fatal 场景均实际执行。证据 `docs/audits/evidence/2026-07-14-lifecycle/51-authenticated-daemon-full-with-gemini.json`。
- **idle 补充**：新增真实 Gemini idle stop-session，定向 **1 passed**；随后完整 authenticated suite 为 **27 passed / 1 skipped，28 tests，exit 0，275.67s**，Gemini idle 与 fatal 均实际执行。证据 `docs/audits/evidence/2026-07-14-lifecycle/52-gemini-idle-stop.json`、`docs/audits/evidence/2026-07-14-lifecycle/53-authenticated-daemon-full-with-gemini-idle.json`。

### 2026-07-14 authenticated Web 归档与 Archived Sessions 复核

- **CLI-REL-007/UX-A11Y-001（P1）**：隔离环境 `lucid-valley` 中真实创建 Codex session，进入 Details 后将 Quick Actions 滚动到可视区，以物理 pointer down/up 激活 `Move out of workspace`。浏览器网络记录 `POST /v1/sessions/cmrkjahor00028aayjfe51b22/archive` 返回 **200**，页面回到 `/`，active workspace 不再显示该会话；随后 Project Actions → Archived Sessions 能重新找到同一会话并打开。证据 `docs/audits/evidence/2026-07-14-lifecycle/54-authenticated-web-archive-and-archived-list.json`，截图 `/tmp/lifecycle-web-archive-button.png`、`/tmp/lifecycle-web-archived-list.png`。
- **限制与剩余风险**：归档详情没有稳定显示 `archived` lifecycle pill；真实请求完成太快，未在浏览器快照中捕获 `stopping` 中间帧。因此该证据只关闭“真实 Web 操作→Server archive→Archived Sessions 可见”子项，不关闭 CLI-REL-007；timeout UI、Native/屏幕阅读器、macOS/Windows、有效 Provider 和 GitLab protected runner 仍开放。

### 2026-07-14 App 归档终态投影修复与 Web 复核

- **CLI-REL-007（P1）**：继续复核上一条 Web 证据时，确认 archived-list overlay 关闭后，已由 Server 返回 archive 200 的会话 Header 仍显示橙色 `archiveRequested`。源码根因位于 `packages/agenthub-app/sources/sync/ops.ts`：`requestSessionArchiveStop` 只会在 Server archive 成功后返回，但 `applyArchiveStopProjection` 又把独立的 daemon stop observation（例如 `stopping`）投影成 workspace 生命周期，导致本地状态冻结在非终态。GitNexus 对两个符号给出 **CRITICAL** 影响级别（3 个直接调用者、11 个上游符号、3 条流程、5 个模块），因此修复严格限制在投影函数及其测试，不改 Server、daemon、路由或 UI 组件。
- **TDD 与回归**：RED `ops.test.ts` 为 **2 failed/16 passed**，精确暴露 `archiveRequested/exited` 未收敛 `archived`；最小修复后 GREEN **18/18**，生命周期定向 **3 files/34 tests**，App 全量 **181 files/1168 tests**，`tsc --noEmit` 与 `git diff --check` 均退出码 0。
- **真实页面验证**：隔离 authenticated Web `snug-meadow` 创建真实 Codex session `cmrknorlj000q8a8wy44vt3o0`，物理 pointer 触发归档，`POST /archive` 返回 **200**；从 Archived Sessions 重新打开并关闭 overlay 后，Header 显示绿色终态归档 pill 和 inactive hint。浏览器、隔离 server/web/daemon 均已清理，端口 37125/19007 无监听；生产 systemd daemon PID 1348150 与 runner 2072452/1687829、8443 ESTAB 不变量保持。完整证据为 `docs/audits/evidence/2026-07-14-lifecycle/55-app-archive-terminal-projection.json`。
- **剩余风险**：终态 Web 观察已闭合；真实请求过快，`stopping` UI 中间帧仍未截图，但 daemon/App RPC 的 `running→stopping→exited` 已由证据 48 覆盖。timeout UI、Native/屏幕阅读器、macOS/Windows、有效 Provider 请求及真实 GitLab protected runner 仍开放；绿色 pill 目前复用动作型文案 `Move out of workspace`，专用单数 `Archived` i18n 文案列入 Phase 3 UX 改进。

### 2026-07-14 Web production bundle 死代码减重

- **APP-PERF-003（P2）**：带 source map 的 production export 证明 `SessionView` 仍调用 `prefetchPierreDiff`，而 `PierreDiffView` 的公开渲染路径早已固定为项目自有 `EditorDiffView`。这段不可达 Pierre loader 仍让 Metro 把 `@pierre/diffs`、Shiki 全语言、Cytoscape 等 533 个模块提升进 common，并在进入任意 session 时主动预取。GitNexus 对相关内部符号判定为 LOW，且公开 renderer 行为不变。
- **修复与验证**：先增加 bundle boundary RED（1/1 failed），再删除预取调用和不可达 loader；第二个 manifest RED 又确认无用 `@pierre/diffs` 仍作为直依赖安装，随后从 App manifest/lockfile 移除，offline frozen lockfile exit 0。定向 **3 files/7 tests**、manifest guard 1/1、App 全量 **182 files/1169 tests**、typecheck/diff check 全绿。新 production export 从 4505 降至 3972 modules，JS 文件 303→43，JS raw 21,088,179→10,240,691（-51.44%），全 JS gzip 4,654,814→2,678,191（-42.46%），entry gzip 2,727,216→2,274,584（-16.60%），总产物减少 10,847,488 bytes；扫描不再含 Pierre/Shiki language/Cytoscape。
- **真实页面回归**：authenticated Web `sharp-harbor` 创建真实 Codex session 和新增文件，打开 `Update file` 详情后，项目自有 diff 正常显示 `NEW`、两行内容和 Raw JSON；browser errors 为空，截图 `/tmp/perf-pierre-removal-diff.png`。测试环境、浏览器及临时文件均已清理，生产 daemon/runner/8443 不变量保持。机器证据为 `docs/audits/evidence/2026-07-14-perf/56-web-pierre-dead-code-removal.json`。
- **剩余风险**：entry gzip 仍为 2.27MiB，未达到 1.48MiB 首阶段预算；后续继续评估 SPA 路由切分、同步 locale payload、全量 icon/font 资产和 Web 未使用的 CanvasKit public 输出，不降低性能门槛。

### 2026-07-14 Phase 1 唯一阻断归并与统一回归

- **状态校正**：总计划已按用户目标统一为 Phase 0–4，不再把“审计基线”单独编号为 Phase 0。此前“P0 已清零”的表述不准确：`APP-SEC-002` 在 Native 双账号 A→注销→B、返回栈和设备慢响应证据完成前仍为 Mitigated。验证矩阵顶部新增按审计 ID 去重的收口快照；后文同 ID 历史行仅保留证据时间线，不再重复计算旧缺口。
- **Phase 1 Linux 统一回归**：authenticated daemon 长套件 **25 passed / 3 skipped / 28 total，exit 0，244.74s**，覆盖 stop/exited/timeout、压力与并发、Server outage cleanup、adoption/reconnect、加密 journal/session-end replay、三类 bundle 失败回滚、Codex/Claude/ACP 真实 backend fatal 和 ACP idle stop。三个 skip 为显式 version-mismatch TODO 与本轮已清理临时 Gemini CLI 后的 Gemini idle/fatal 外部条件；Gemini 真实进程 fatal/idle 仍由证据 50/52/53 固定，不将本轮 skip 冒充通过。
- **统一包与门禁回归**：App **182 files/1169 tests**、Server **33 files/129 tests（2 Redis integration skip）**、CLI unit/build **109 files/745 tests**；root pinned `ci:verify` 的 7 workspace typecheck、protocol 7/7、environment 23/23、Docker 8/8、SBOM/provenance/audit/reachability/license/provider/release/supply-chain policy 全部通过，release metadata `ok=true`。
- **进程治理**：CLI build 使 systemd daemon 1348150→1884473；新 daemon 继续收养生产 runner 2072452/1687829，daemon list 与进程表一致，daemon 和两个 runner 均有 8443 ESTAB，隔离环境 `merry-grove` 已移除。机器证据 `docs/audits/evidence/2026-07-14-lifecycle/57-phase1-unified-regression-and-closure-ledger.json`。
- **阶段判定**：Linux 本机 Phase 1 核心实现与新鲜回归已闭环；当前仍不能进入正式 Phase 2 收尾，因为 Phase 0/1 的关闭条件集中在 Native、macOS/Windows、有效 Provider/Vault、protected GitLab、registry/Kubernetes/release 等外部执行环境。不得用 mock、skip 或人工截图代替这些证据。
- **Native 外部门槛复核**：本机已有 Android SDK/adb 和 arm64 delivery APK，但没有 ready Android device；Android QA 正确输出 `blocked: no ready Android device`（exit 2）。Linux 无 `xcrun simctl`，iOS QA 正确输出 blocked（exit 2）。生成两份平台阻断报告后，聚合器 `--allow-partial` 为 `status=partial`、`failures=[]`、两个 blockers、exit 0，且明确 `readyToMarkV02Done=false`。报告位于 `artifacts/agenthub-v02-android-native-qa-20260714-2133.json`、`artifacts/agenthub-v02-ios-native-qa-20260714-2136.json` 与 `artifacts/agenthub-v02-native-qa-evidence-latest.json`。

### 2026-07-14 Android Native QA fail-closed 修复

- **真实复现**：本机已有 `agenthub_v02_api36` AVD、API 36 Google APIs x86_64 镜像和 KVM。启动模拟器并安装 delivery APK 后，旧 QA runner 退出 0 且报告 `completed`，但四张截图分别为正常未登录页、Android `Open with` Resolver、`AgentHub isn't responding` ANR、launcher 上的 chooser；logcat 明确包含 `ANR in com.artsum.agenthub`。这证明旧门禁只检查 adb 退出码，没有验证截图内容。
- **根因与影响**：隐式 VIEW deep link 在 production/preview 同装时进入 Resolver；runner 不校验前台 Activity、UI 语义、ANR/FATAL；同时 handoff 把 production delivery APK 与 dev-only modal/code routes 混为一个场景。GitNexus 对 `buildAndroidNativeQaPlan` 给出 LOW：2 个直接依赖、0 execution flows，修改限定在 Native QA harness。
- **TDD 修复**：首轮 RED **2 failed/9 passed** 固定显式目标和 ANR fail-closed；GREEN **2 files/11 tests**。Android 36 上又发现 `adb shell uiautomator dump /dev/tty` 不回传 XML，追加 RED **1 failed/3 passed** 后改用 `adb exec-out`，GREEN 4/4。Runner 现在显式绑定 `com.artsum.agenthub/.MainActivity`，每个场景先验证前台 Activity 和预期 UI 文本，再截图；启动前清 logcat，最终拒绝 ANR/FATAL。
- **真实回归**：相同 production APK 复跑现在正确退出 1，原因 `verify alert content failed: expected output Simple Alert`；`uiautomator` 实际显示 `expo-router-unmatched/Unmatched Route`，这是 production 排除 dev routes 的预期安全行为。严格聚合器退出 1、`status=failed`、`readyToMarkV02Done=false`，不再接受无关截图。App full **182 files/1170 tests**、typecheck/diff check 均通过。证据 `docs/audits/evidence/2026-07-14-native/58-android-native-qa-fail-closed.json`。
- **剩余设备工作**：production delivery smoke 与 preview-only modal/prompt/code-surface 已完成隔离，production dev routes 未重新开放；仍需 authenticated Android 账号生命周期、Mermaid 断网、生物识别/防截屏/后台/剪贴板、arm64 真机和 iOS 矩阵。
Android Native QA 证据边界加固（2026-07-14 22:00–22:10）：审计确认生产包排除 Dev Route 是正确安全行为，原 QA 却要求生产包打开 modal/prompt/code-surface，导致 Resolver/ANR 假绿；首次仅做 Activity 检查的冒烟又在截图中暴露“Splash 也可 completed”。修复后 `production-smoke` 只验证生产包真实启动链路并要求前台 Activity、`AgentHub` UI 语义、有效截图和无 ANR/FATAL；`preview-visual` 独占四个视觉夹具，package/profile 不匹配直接 blocked。证据聚合要求生产 `semanticReady` 与独立 Preview 报告，不再接受历史混合报告完成 Android 门槛。Native QA **61/61**、App **1172/1172**、typecheck 均通过；Android 36 x86_64 生产冒烟 exit 0 且人工截图确认完整未登录页。严格聚合 exit 2、partial、0 failures，剩余 arm64 实机、Preview 视觉构建（已由后续第 60 号证据完成）及 macOS/iOS，见 `docs/audits/evidence/2026-07-14-native/59-android-native-qa-profile-split.json`。

Android 当前源码 Preview/Production Native 闭环（2026-07-14 22:20–22:55）：Preview 首次构建暴露 libsodium 被错误解压到 tracked app build 目录，以及 Preview 错用 production Firebase client；均以失败测试锁定后修复。Preview release 只在明确 `APP_ENV=preview` 保留并放行 QA Dev Routes，production/未声明变体仍从 Metro context 排除。当前源码 Preview arm64 build **1707 tasks / exit 0**，Android 36 四场景 `completed/semanticReady=true/exit 0`，四张截图人工复核通过；随后 production 完整 prebuild/build **1708 tasks / exit 0**，包名 `com.artsum.agenthub`，新的生产烟测与人工截图通过；`dev/modal-demo`、`dev/code-surfaces`、`agenthubNativeQa`、`Simple Alert`、`Rename workspace`、`Code Surfaces` 在最终生产 Hermes bundle 全部 absent。App full **183 files/1175 tests**、typecheck exit 0。聚合器确认 `android.visualVerified=true`、`failures=0`，但严格 exit 2/partial，因为 x86_64 不替代 arm64 真机且 Linux 无 iOS `xcrun`。证据 `docs/audits/evidence/2026-07-14-native/60-preview-visual-and-production-rebuild.json`。

Codex active-turn backend fatal 完整性修复（2026-07-14 23:04–23:14）：新增真实 authenticated 故障注入，在 Codex turn 已进入 `thinking=true` 后 SIGKILL app-server；RED 证明 runner 会归档但把唯一 `turn-end` 错标为 `cancelled`。`requestProcessShutdown` 的 GitNexus 上游影响为 LOW（4 直接调用、1 流程），修复仅新增显式 `turnStatus` 参数并让两个异常 app-server 路径传 `failed`，正常用户终止和 signals 仍使用 `cancelled`。GREEN 真实用例确认唯一 `turn-end(failed)`、`thinking=false`、Server `active=false`、metadata `archivedBy=cli`；完整 authenticated daemon **28 passed/1 显式 skip/29 total**，CLI unit **745/745**、typecheck/diff check 通过，生产 daemon/runner/8443 不变量保持。证据 `docs/audits/evidence/2026-07-14-lifecycle/61-codex-active-turn-fatal-and-daemon-regression.json`。CLI-REL-001/005 的 Codex active fatal 子风险关闭；其他 Provider active、有效凭据、跨平台、Native timeout UI 和 protected runner 仍开放。

Claude active-turn fatal 真实补证（2026-07-14 23:18–23:21）：旧测试在发现 Claude SDK child 后立即 SIGKILL，不能证明 Wire turn 已真正开始；新增 `turn-start` 持久化断言后首轮失败，确认此前证据偏 startup。仅调整测试时序，先观测加密 `role=session/turn-start` 再注入 fatal，生产实现无需修改；重跑确认唯一 `turn-end(failed)`、thinking 关闭、Server inactive 和 CLI 归档均通过（1/1，exit 0）。与第 61 号完整 daemon 28/1、CLI unit 745/745 门禁共同证明当前源码未回归；证据 `docs/audits/evidence/2026-07-14-lifecycle/62-claude-active-turn-fatal-evidence.json`。CLI-REL-001 的 Claude active fatal 子风险关闭，ACP/Gemini/OpenClaw active 与外部平台门槛仍保留。

ACP/OpenCode active-turn fatal 修复与最终回归（2026-07-14 23:22–23:33）：将真实 OpenCode 测试收紧为先观测 `thinking=true` 和持久化 Wire `turn-start` 再 SIGKILL，RED 复现唯一 `turn-end=cancelled`。`stopRunnerFromBackendStatus` 影响 LOW；主动 abort/kill 已由 `abortInProgress` 和 coordinator state 过滤，故未过滤的 `error` 或 `stopped` 都属于意外 Provider 终止。最小修复统一传 `failed`，补单元契约后 **13/13** 和真实 active **1/1** 通过。最终当前源码 CLI unit **746/746**、typecheck、完整 authenticated daemon **28 passed/1 显式 skip/29 total** 全绿，同轮覆盖 Codex/Claude/ACP active fatal、Gemini fatal/idle、stop/timeout/adoption/journal/reconnect/bundle rollback。证据 `docs/audits/evidence/2026-07-14-lifecycle/63-acp-active-turn-fatal-and-final-provider-regression.json`。CLI-REL-001/005 在 Linux 本机可执行的三类 active fatal 子风险关闭；Gemini valid-turn、OpenClaw live gateway、Native/跨平台和 protected runner 仍开放。

CLI-REL-007 App 归档中间态与状态标签修复（2026-07-14 23:39–23:49）：GitNexus 将 `requestSessionArchiveStop` 与两个 UI 调用入口判定为 CRITICAL blast radius（10 symbols、3 processes、5 modules），因此只新增可选 daemon observation callback 和纯 `applyArchiveStopObservation`，不改变最终 `archived`、legacy fallback 或 active/thinking 的终态所有权。RED 为 App **1175 passed/5 failed** 与 lifecycle **1 passed/5 failed**；GREEN 为 ops **23/23**、生命周期+i18n **30/30**、App full **183 files/1180 tests**、typecheck/diff check exit 0。五类徽标采用专用状态文案并补齐十种语言。隔离 authenticated Web `grand-comet` 创建真实 Codex session，隔离 daemon `stop-session` 返回 stopping 后快速收敛 archived；桌面和 390×844 均显示绿色 `Archived` pill 与 inactive hint，无裁切。真实路径过快，未把 stopping/timeout 帧伪造成截图；pre-archive 时序由 deferred HTTP 测试证明，Native/屏幕阅读器 timeout 仍开放。证据 `docs/audits/evidence/2026-07-14-lifecycle/66-app-archive-stop-observation-and-web-labels.json`。

### 2026-07-15 Android 慢响应与环境凭据显示边界

- **APP-SEC-002（P0，Android 设备级竞态关闭）**：在 API 36 Preview 上真实执行后台→挂起 `/v1/sessions`→前台→确认注销。QA-only delay proxy 先 RED，随后正常转发、hold/release、客户端 Abort **3/3 PASS**；设备事件从 `held` 收敛为 `downstream-aborted`，再创建的账户 B 与 A identity hash 不同，root secret 未 reveal/copy，未见 A 数据。Android 慢响应子风险关闭；iOS A→B/返回栈和同竞态仍开放。
- **ENG-ENV-001（P1，认证 URL 重放修复）**：真实 `env:list` 暴露它会重新显示已持久化 authenticated Web URL 的查询凭据。新增 `sanitizeEnvironmentListUrl`，历史列表清除 username/password/query/fragment，同时保留 `env:up` 当次 Open URL 的既有用途。环境管理 **24/24 PASS**，真实列表 35 个 Web App 条目中 credential marker 为 **0**。凭据值未写入证据或文档。
- **验证与清理**：证据 `docs/audits/evidence/2026-07-15-native/73-android-slow-response-and-env-list-redaction.json`；临时 HTTPS 隧道、代理、隔离 `agile-cedar` 环境和模拟器均已关闭，无孤儿隔离进程。生产 systemd daemon PID 1884473、runner 2072452/1687829 与 8443 ESTAB 保持一致。

### 2026-07-15 Android Mermaid 与恢复密钥保护

- **APP-SEC-003（P1，Android 子矩阵关闭）**：Preview QA 增加 hostile Mermaid 夹具，先取得缺失场景的 **1/1 RED**，再以最小数据夹具完成 GREEN。API 36 关闭 Wi-Fi/数据后仍从随包资源渲染正常图；语法错误进入受控卡片；`</script>`、伪 bridge 和外链组合输入只以转义错误文本呈现。截图人工复核信息层级、字体和错误状态均与现有 Amber Crystal 页面一致，无裁切；logcat 无外链、伪消息、ANR/FATAL。
- **APP-SEC-007（P1，Android 子矩阵关闭）**：临时注册 Pixel Imprint 后，系统认证取消保持 `Tap to reveal`，指纹成功才挂载秘密视图；可见态 `adb screencap` 得到 1080×2400、单色、mean=0 的全黑图。HOME 后返回恢复隐藏；copy 再次要求指纹，成功态 U+F21E 在 32 秒后回到 U+F290，证明设备计时回调执行，条件清理由现有 policy 单测锁定。密钥正文未进入保留截图/JSON，临时文件、App 数据、PIN/指纹与模拟器均已清理。
- **构建与证据**：安全专项 **4 files/11 tests**、production route/build 边界 **3 files/12 tests**、App typecheck 和 Preview arm64 **1707 tasks/131s** 全绿。证据 `docs/audits/evidence/2026-07-15-native/76-android-mermaid-and-secret-protection.json`；APP-SEC-003/007 仍需 iOS 同矩阵才能从 Mitigated 改为 Closed。
- **新增 UX-I18N-001 复现**：同一 Android Account 截图显示通知拒绝态错误使用 “iOS has stopped prompting” 平台专用文字，并在移动宽度截断。该问题不影响本批安全边界，登记到 Phase 3 的平台化文案、动态 locale 和移动 reflow 批次，不能因安全测试通过而遗漏。

### 2026-07-15 iOS 安全 QA fail-closed 契约

- **发现**：现有 `iosNativeQaCli` 只验证 `.app`/bundle/simulator 可用性，然后安装、启动、打开 Preview modal/prompt/code-surface、截图和采集日志；只要这些命令退出 0 就直接报告 `completed`。该报告没有语义断言，更未覆盖 APP-SEC-002 的 A→B/慢响应、APP-SEC-003 的断网/恶意 Mermaid、APP-SEC-007 的认证取消/成功、防快照、后台隐藏和剪贴板回收，因此存在把视觉冒烟误作安全完成的 P0 验证风险。
- **修复**：新增八项不可省略的 iOS security evidence schema，并将 runner 完成态绑定到同一 booted simulator UDID。每项必须 `passed`、有非空说明和至少一个位于当前 artifacts realpath 内的非空证据文件；缺失报告为 `blocked/exit 2`，格式错误、缺项、失败、重复、未知、设备不匹配、路径/符号链接逃逸、文件缺失或为空均为 `failed/exit 1`。视觉步骤通过但安全报告缺失时保留 `visualStatus=completed`，但不得上升为整体完成。
- **验证**：契约/计划先 RED（2 files failed），CLI 视觉-only 先 RED（返回 0 而非 2）；GREEN 后定向 **3 files/13 tests**、App typecheck 均 exit 0。Linux 本机新鲜运行仍因没有 `xcrun simctl` 正确 blocked/exit 2，报告 `artifacts/agenthub-v02-ios-native-qa-20260715-0128.json`。完整证据与 macOS handoff 分别见 `docs/audits/evidence/2026-07-15-native/77-ios-security-qa-fail-closed-contract.json`、`docs/agenthub-v02-native-qa-handoff.md`。
- **剩余风险**：本批只消除了 QA 假完成并定义了 macOS 自动化交付接口，尚未在 iOS 上产生八项真实证据；APP-SEC-002/003/007 状态不变，仍为 `Mitigated`。

### 2026-07-15 Claude 空闲停止与原子归档补偿

- **CLI-REL-001/005/007（P1）**：真实 Claude 启动前空闲 stop 首轮暴露 runner 已退出、daemon tracking 已清理，但 session-end 未确认时 Server 仍可能保留 active 或 E2EE metadata `lifecycleState=running`。旧 shutdown 还会把 10 秒发送等待和 10 秒 flush 串联，超过 daemon 的 10 秒 stop timeout 后被升级为 SIGKILL。
- **TDD 修复**：`ApiSessionClient` 将 session-end marker 持久化到 journal，使用 2 秒 ACK 和 1 秒 shutdown flush 有界等待，失败时保留 marker；daemon 仅在匹配 marker 尚待发送时调用原生 fetch fallback，并携带重新加密的 archived metadata 与 expected metadataVersion。Server `/archive` 以 tenant/id/version `updateMany` 同时收敛 active/thinking/metadata，CAS 冲突返回 409，旧无 body 调用保持兼容。
- **真实语义**：隔离 authenticated 环境中，Claude runner 在 backend 尚未启动时 stop-session 成功，Server 与解密 metadata 均归档，journal 被消费，且没有伪造 `turn-start` 或 `turn-end`。目标用例 **1/1**；共享回归 Claude active fatal + ACP idle stop **2/2**；CLI unit **109 files/751 tests**、Server archive route **6/6**、CLI/Server TypeScript 与 diff check 全绿。两个隔离环境均已移除，systemd `KillMode=process`、单 daemon 3111921、runner 2072452/1687829 和三条 8443 ESTAB 保持一致。
- **证据与边界**：机器证据为 `docs/audits/evidence/2026-07-15-lifecycle/78-claude-idle-stop-and-atomic-archive-fallback.json`。该批关闭 Claude 启动前/空闲 stop 的本机子风险，不替代有效 active-turn Gemini、live-gateway OpenClaw、macOS/Windows 或 protected GitLab provider matrix，因此 Phase 1 仍处于收尾而非关闭。

### 2026-07-15 Web CanvasKit 与图标字体减重

- **APP-PERF-003（P2）**：production export 仍携带 8,001,100-byte `canvaskit.wasm`，但 Web QR 已通过 `QRCode.web.tsx` 使用 SVG，两个 `loadSkia` helper 均为 0 调用；同时 97 个源码文件从 `@expo/vector-icons` barrel 导入，令 Metro 导出 19 套字体，即使 production 实际只使用四套。
- **TDD 与最小修复**：CanvasKit 边界和 icon barrel 边界分别先 **1/1 RED**；随后保留 Native Skia QR/依赖，只移除 Web setup copy、公共 WASM 和无调用 helper，并把具名 barrel import 机械展开为 family default import。测试 mock 同步 direct path 后，边界+AgentGoalBar **3 files/7 tests**、App typecheck、非平台全量 **185 files/1183 tests** 全绿。
- **产物收益**：新鲜 production export 为 3,931 modules、43 JS files。CanvasKit 单独减少 8,001,100 raw / 3,218,376 gzip；direct icon import 令字体 19→4 套，减少 15 files / 2,144,472 raw / 1,109,132 gzip，JS 另减少 219,222 raw / 73,240 gzip。最终 export 为 16,295,943 raw / 7,185,828 gzip，JS 为 10,026,067 raw / 2,617,176 gzip，bootstrap pair 为 8,606,746 raw / 2,210,613 gzip。
- **真实页面与边界**：authenticated Web `zesty-star` 的 Terminals/Settings 桌面及 390×844 设置页图标、状态和布局正常，page errors 为 0；三张截图与机器数据见 `docs/audits/evidence/2026-07-15-perf/79-web-canvaskit-and-icon-font-pruning.json`。浏览器/环境已清理。该证据捕获时完整 App gate 因 tracked Android 为 Preview namespace 而失败；此生成配置漂移已由下方第 80 号证据修复，当前完整 App gate **186 files/1189 tests** 全绿。bootstrap pair 仍高于 1.48MiB，继续推进 route/feature lazy、locale 和图片优化。

### 2026-07-15 Android canonical 原生树与签名 argv 加固

- **ENG-REL-001 / APP-SEC-008（P0/P1）**：Android Preview 构建会破坏性 prebuild tracked `android/`，成功或失败后都不恢复 Production；同时 release 密码用 Gradle `-P` 传入并暴露在进程 argv。构建脚本属于所有 Android release 的共享边界，按高风险处理；GitNexus transport 在本次 shell/Gradle 边界检查时不可用，未把“无图结果”误作低风险。
- **TDD 与修复**：canonical recovery 先 RED **1 failed/2 passed**；非 Production 在任何原生变更前安装 EXIT trap，保留原退出码，重新生成 Production 并清 stamp，恢复失败则使原成功构建失败。失败注入验证原 exit 1 不被吞掉。签名 argv 再 RED **1 failed/3 passed**，改用 `ORG_GRADLE_PROJECT_*` 环境属性后专项 **2 files/8 tests**；密码不再出现在 Gradle argv，也不进入日志或仓库文件。
- **真实构建与回归**：修复后的 Preview arm64 release **1707 tasks、BUILD SUCCESSFUL、exit 0**，APK 包名 `com.artsum.agenthub.preview`、签名有效、56,387,987 bytes、0600，时间戳/latest SHA-256 一致。构建中 `/proc/cmdline` 检查 `password_in_argv=0`；退出后 tracked 树为 `com.artsum.agenthub`、production OTA、正式 app name、Google Services 与 Java package，stamp absent。App **186 files/1189 tests**、typecheck、shell syntax、diff check 全绿；证据 `docs/audits/evidence/2026-07-15-native/80-android-canonical-tree-and-signing-argv-hardening.json`。
- **边界**：签名值仍会在 Gradle 调用生命周期内存在于进程环境；同 UID 读取被视为当前专用构建主机的残余边界，最终发布应迁移到隔离的 ephemeral signer/protected runner。arm64 真机和 iOS/macOS 矩阵仍未完成。

### 2026-07-15 Wire 发布包 clean-install 契约

- **APP-ARCH-001/002（P2）**：此前 workspace 源码、包入口和编译期 RPC 契约已统一，但 CI 的 pack 检查没有证明发布 tarball 在仓库外可安装、ESM/CJS/types 可解析，也没有锁定 pnpm 将消费者的 `workspace:*` 转换为精确发布版本。
- **自动化门禁**：新增 `pack-contract:test` 并接入根 `ci:verify`。测试真实构建/打包 `@artsum/agenthub-wire`，在仓库外 `mkdtemp` 目录 offline 安装且禁用 lifecycle scripts，然后分别执行 Node ESM import、CommonJS require 和 TypeScript NodeNext typecheck；另对 `@artsum/agenthub`、`agenthub-agent` tarball 解包，要求 Wire 依赖为 `1.0.0` 且整个 manifest 不含 `workspace:`。
- **结果与边界**：最终 **2/2 PASS、exit 0、44.02s**，临时目录由 `finally` 清理，且未 build/替换 CLI dist，因此生产 daemon 不受影响。机器证据为 `docs/audits/evidence/2026-07-15-perf/86-wire-pack-contract.json`。该项关闭本地发布转换/运行时一致性缺口；真实 npm registry publication 与 protected GitLab runner 仍保持 Phase 4 外部门槛。

### 2026-07-15 Bundle 回滚全类刷新与 CI authenticated URL 脱敏

- **CLI-REL-006（P1，Linux 本机已知类关闭）**：同一 authenticated 私有环境中重新注入入口语法损坏、dependent chunk 删除、dependent chunk symlink，**3 passed/27 non-target skipped、exit 0**；每类均保持当前 daemon 可用、恢复完整 previous dist，并记录拒绝/恢复。`quick-summit` 及进程已删除，生产 systemd/runner/8443 不变量保持。
- **新增 P0 日志发现**：首次真实测试输出把完整临时 `dev_token`/`dev_secret` URL 打到 stdout，可能进入 CI/桌面任务日志。GitNexus 对 `seedAuthenticatedEnvironment`/`commandUp` 的 impact 请求因 transport closed 失败，按高风险共享边界处理。新增输出策略测试先 **1 failed/24 skipped**，实现 CI truthy 时仅打印无 query origin、本地显式开发仍保留可打开 URL后，环境策略 **25/25**。
- **真实复核**：修复后再跑 authenticated bundle corruption 集成 **1 passed/29 non-target skipped、exit 0**，临时私有日志扫描 `credential_query_in_ci_log=0`、`sanitized_auth_url_present=1`，随后日志与环境删除。证据 `docs/audits/evidence/2026-07-15-lifecycle/81-bundle-rollback-and-ci-auth-output.json`。
- **Phase 1 外部条件**：本机只有 Codex/Claude/OpenCode；Gemini、OpenClaw、Vault、glab、kubectl、Provider/Vault/GitLab credentials、18789 gateway、xcrun 和 Windows shell 均不可用。详细 presence-only 证据见 `docs/audits/evidence/2026-07-15-lifecycle/82-phase1-external-runner-availability.json`；这些项保持 Open，不以 fake/skip/配置替代真实通过。

### 2026-07-15 Presence timeout 与 Machine 列表 query-plan 门禁

- **SRV-PERF-001 / SRV-REL-001（P1/P2）**：Machine 账户列表只有 `accountId` 索引，仍需额外排序；每分钟 Session/Machine timeout sweep 对 `active=true AND lastActiveAt<=cutoff` 没有匹配索引，会扫描全部历史行。GitNexus 对三个核心模型的 impact 均因 transport closed 失败，故按 HIGH 风险数据库边界处理。
- **TDD**：应用真实全量 migrations，灌入 50 accounts、20k Session、20k Machine 并 `ANALYZE`。RED **4/4 failed**：三个索引不存在，Machine 只用旧 account index，两条 timeout 没有 index。增加 `(accountId,lastActiveAt DESC)` 和只含 active 行的两个 partial index；首次 `CONCURRENTLY` 实现被 transactional PGlite 正确拒绝，未跳过 standalone，自托管兼容版本改用 portable `CREATE INDEX IF NOT EXISTS`。GREEN PGlite **4/4**。
- **真实 PostgreSQL 与回归**：临时 PostgreSQL 16-alpine 完整 `prisma migrate deploy` exit 0，同样各 20k 行后 `EXPLAIN (ANALYZE, BUFFERS)` **3/3** 命中精确索引，容器已删除。Server full **34 files passed/1 external skipped；134 tests passed/2 external skipped**，typecheck、Prisma validate、diff check 全绿；证据 `docs/audits/evidence/2026-07-15-server/83-presence-query-plan-indexes.json`。
- **边界**：为保持 PostgreSQL/PGlite 单一 migration，portable index build 不是 concurrent；已有超大生产库升级应安排维护窗口。此前缺少的 Kubernetes 多副本矩阵已由下方第 84 号证据闭合。

### 2026-07-15 Kubernetes 三副本压力、故障恢复与部署 fail-closed

- **SRV-REL-001 / SRV-PERF-001 / ENG-DKR-001（P1/P2）**：临时校验安装官方 kubectl v1.36.2 与 minikube v1.38.1，在 Docker driver Kubernetes v1.35.1 建立 3 副本 Server、PostgreSQL、Redis Streams、MinIO、Prometheus/Grafana 环境。部署脚本首次真实运行暴露四项问题：migration `|| true` 隐藏失败、Minikube 节点无法读取宿主绝对 build context、Pod label wait 创建竞态、`S3_HOST=minio` 与实际 `agenthub-minio` Service 不一致导致全部 Server `EAI_AGAIN` CrashLoop。逐项以 policy RED 锁定后改为 migration fail-closed、宿主 build+精确 image load 校验、Deployment readiness、stdin 临时用途隔离 secret 和正确 Service DNS；43 个 migration 全部应用，最终 rollout 为 desired/ready/available/updated **3/3/3/3**。
- **测试编排与安全背压**：首轮又发现宿主 6379 已被其他容器占用且 runner 未验证 port-forward，以及旧压力脚本一次向同一 caller 发 10/50 RPC，把生产每 socket 8 in-flight 背压误报成注册丢失。修复为动态 loopback 端口+进程/TCP readiness，并以最多 8 并发批次运行，保留且显式断言 `Too many in-flight RPC calls`，没有放宽生产 limiter。GitNexus 对三个集成测试函数的 impact 均因 transport closed 失败，故按 HIGH 保守风险只改测试编排。Docker policy 最终 **1 file/10 tests PASS**，shell/Node syntax 与 diff check 均 exit 0。
- **真实结果**：安全矩阵 **8 passed/0 failed/2 destructive skipped，exit 0**；最终单命令完整矩阵 **10 passed/0 failed/0 skipped，exit 0**。5,000 entries/s 场景注入 178,000 条无失败；fire-and-forget 20/20、reconnect 25/25、50 daemon 连接 50/50 且 RPC 250/250、iOS machine/session 各 15/15、跨三副本 20/20；rolling-deploy 故障前 30/30、强删 Pod 后 t+1s 与 t+5s 均 30/30，dead-daemon verdict `ALL PASSED` 且替代 Pod Ready。
- **性能发现与清理**：收窄 Server 依赖层从复制整个 `scripts/` 到只复制 `postinstall.cjs` 后，普通测试改动不再击穿 2,229 包缓存，观察到的 build context 从约 399.5MB 降为 1.16MB；runtime 直接执行镜像内 `tsx`，不再由 Corepack 在 Pod 启动时联网获取 pnpm。镜像仍为 **4,825,265,039 bytes（4.83GB）/16 layers**，全仓 `node_modules` 剪枝保持 Phase 4 开放项，不将其冒充最小镜像。Minikube、镜像、临时工具/日志、port-forward 与压力进程均已删除；生产 systemd daemon PID 3111921、runner 2072452/1687829 与三条 8443 ESTAB 不变量保持。完整机器证据为 `docs/audits/evidence/2026-07-15-server/84-minikube-multi-replica-stress-and-failclosed-deploy.json`。

### 2026-07-15 Server runtime 镜像依赖剪枝

- **ENG-DKR-001 / ENG-DEP-001（P1/P2）**：第 84 号真实集群证据量化 Server runtime 为 **4,825,265,039 bytes**。层分析确认运行镜像复制全仓 hoisted `node_modules`，并使用完整 `node:20`、Python、FFmpeg、Corepack。`pnpm deploy --legacy --prod` 虽得到约 423MB 文件树，却把 locked Prisma 6.19.2 漂移到 6.19.3，因供应链不可复现被拒绝；只加 `--filter` 在宽松 hoist 下仍计划 2,229 包，也被真实构建否定。
- **RED→GREEN**：Docker policy 依次锁定 isolated linker/frozen lockfile、仅 Server/Wire workspace、App patch 显式隔离、node:20-slim digest、无 Python/FFmpeg/Corepack、package-local executable 与 migration 禁止 npx。isolated 首次安装降至 604 包但暴露 Unistyles App-only postinstall；分组后下一次 build 又暴露 Server 直接 import `pino`、集成测试 import `socket.io-client` 却未声明，补为 runtime/dev dependency 后仍保持 Prisma 6.19.2。首个 slim smoke 43 migrations 成功，但 `/repo` cwd 无法解析 `@/*` alias 且 Prisma 报缺 OpenSSL；最终将 WORKDIR 收敛到 Server package，并只安装 OpenSSL。
- **真实结果**：最终 digest-pinned image `sha256:291e7cf...` 为 **835,602,212 bytes / 13 layers**，相对基线减少 **3,989,662,827 bytes（82.6828%）**。镜像内存在 tsx、Prisma、Wire `index.mjs`、Pino 10.3.0，不含 Electron/Skia/Python/FFmpeg；`Config.User=agenthub`。临时 PostgreSQL 16-alpine 完整 43 migrations exit 0，Redis 7-alpine + MinIO 环境中 production Server 保持 running/restart=0，`/health` 两次 HTTP 200，日志进入 API/metrics Ready；容器、network、镜像、临时树和日志均清理。Docker policy **10/10**、App postinstall policy **5/5**、镜像内 Wire/Server typecheck 均通过。证据 `docs/audits/evidence/2026-07-15-server/85-server-runtime-image-pruning.json`。
- **后续刷新**：本段 835.6MB 为 Evidence85 历史结果；当前结果已由 Evidence196 刷新为 640,645,138 bytes，并补齐嵌套 `.env`、本地 data/WAL、日志 context 排除及 production-only 依赖重建。镜像仍用 TS 源运行并携带 Prisma migration tooling；compiled-JS 或独立 migration image 可继续减重，前提是补足兼容与回滚测试。protected release 仍是外部门禁。

### 2026-07-15 Web 首阶段启动预算与大型能力懒加载收口

- **APP-PERF-003 / ENG-CI-001（P2）**：production export 的启动预算先从超限状态 RED（gzip 1,559,191 bytes，超过 1.48 MiB 7,299 bytes）推进到 GREEN。SessionView、libsodium、Mermaid/高亮相关路径、QRCode、Fuse 搜索、Seti 文件图标目录和各语言包均形成独立 chunk，production MaterialCommunityIcons 被移除，Web/Native 平台 metadata 分离。最终 export 为 **3,919 modules、58 个 Web bundle、42 个资产、总计 14,744,442 bytes**；`index.html` 三个启动脚本 raw **6,377,022 bytes**、gzip **1,549,863 bytes**，低于 1.48 MiB（1,551,892 bytes）门槛 **2,029 bytes**。
- **QR Hook 与 policy runner RED→GREEN**：将 QRCode 改为异步模块后，真实 `/restore` 页面与回归测试都复现 `Rendered more hooks than during the previous render`；根因是 loading 分支在后续 `useMemo` 前提前返回。最小修复保持所有 Hook 顺序稳定，同时保留明确 loading/error UI。最终 QR **2 files/3 tests**、App typecheck、App 全量 **192 files/1,198 tests**（含 `secretKeyBackup` 57/57）均 exit 0。最终复核另发现旧 `supply-chain:policy` 只打印 `RUN` 即以 0 退出、实际执行 0 项；将 Vitest root 固定到 `scripts/` 后，真实策略 **4/4** 运行通过。预算测试 **2/2** exit 0；包含依赖边界、pack、7 workspace typecheck、环境 25/25、Docker 10/10、SBOM/provenance/audit/reachability/license/provider/release metadata 的统一 `ci:verify` 最终 exit 0。GitLab required `web:export` 使用同一 production export 后执行 `pnpm web:budget reports/web-export`，预算不可通过放宽门槛绕过。
- **authenticated Web 真实验证**：隔离环境 `true-fjord` 应用 43 个 migration；已登录首页的 localStorage 仅有 settings/profile，sessionStorage 与 cookie 为空。刷新后按已接受的 memory-only 产品策略返回登录页；重新认证后 `/restore` 渲染 593 个 SVG path/rect 且无 Hook 错误，真实 Codex 会话得到预期回复，文件浏览页触发 Seti 独立 chunk，切换 `zh-Hans` 后中文登录页和语言 chunk 均生效。最终页面错误为 0；保留四类已知 development warning，未冒充零警告。会话通过 stop-session 正常结束，浏览器、私有 daemon 和隔离环境均已清理，未触碰 production daemon。
- **剩余风险**：本次只关闭 Web 首阶段 gzip/CI 子门禁，不关闭 APP-PERF-003。预算裕量仅 2,029 bytes；libsodium 虽已独立成网络 chunk，但根初始化仍等待它。独立冷/热 profile、不同缩放/分组头、离线/timeout、图片/字体资产和 inactive 会话 heap 压力继续开放。完整命令、指标、截图索引与清理状态见 `docs/audits/evidence/2026-07-15-perf/87-web-bootstrap-budget-and-lazy-capabilities.json`。

### 2026-07-15 生命周期状态 Web/Android 可访问性闭环

- **CLI-REL-007 / UX-A11Y-001（P1）**：生命周期状态此前虽然有专用文案与颜色，但 `ChatHeaderView` 没有把状态变化声明为可访问 live region，Android Native QA 也没有 timeout 状态语义场景。首轮定向测试 **12 项中 7 项失败**，固定五类状态的 `accessible=true`、`accessibilityLiveRegion=polite`、Header 透传及第五个原生场景。
- **TDD 与构建边界修复**：最小实现只扩展纯视觉投影、Header pill 与 Preview-only QA 路由，不改变 archive RPC、Server 终态或 production dev-route 排除。第一张 Android 截图发现 route Stack header 与真实 ChatHeader 重复，先补 **1/1 RED** 再由 route-local `headerShown=false` 修复；首次重建又因测试共置在 `app/` 被 Expo Router 打包而失败，测试移到 `sources/router` 后保持相同断言。最终定向 **4 files/13 tests**、App **194 files/1200 tests**、TypeScript 全绿。
- **Web 与 Android 真实验证**：authenticated Web `zesty-summit` 应用 43 migrations，真实 Codex 会话通过物理 pointer 归档并从 Archived Sessions 重开，DOM 显示 `Archived` 且 `aria-live=polite`，page errors=0；未声明 `APP_ENV` 时访问 QA dev route 得到 Unmatched Route，证明 production 路由继续 fail-closed。Android 36 x86_64 Preview release **1701 tasks / 106s / exit 0**，五场景 QA `completed/semanticReady=true`、31 steps 全部成功，UIAutomator 明确输出 `content-desc="Stop timed out"`，logcat 无 ANR/FATAL；最终截图人工确认只保留单一真实 ChatHeader、无裁切。浏览器、隔离环境、daemon 和模拟器均已清理，未触碰 production daemon。
- **证据边界**：Android 场景是 Preview-only 语义夹具，复用真实 Header/投影，但不伪造真实 daemon timeout RPC；真实成功归档 Web 与 daemon/RPC timeout 证据分别保留。TalkBack 语音输出、VoiceOver、iOS、macOS/Windows、有效 active-turn Gemini、live OpenClaw 和 protected GitLab runner 仍开放，因此 CLI-REL-007/UX-A11Y-001 保持 In Progress。机器证据为 `docs/audits/evidence/2026-07-15-lifecycle/88-lifecycle-accessibility-web-android.json`。

### 2026-07-15 真实 daemon timeout 的 App/Web 可观察链路

- **CLI-REL-002/007（P1）**：真实 daemon 的 `stopping→timeout` 原先只存在于 daemon/RPC 证据。App 在首次收到 `stopping` 后立即请求 Server archive，导致路由和本地投影过早收敛为 `archived`，用户无法观察真实 timeout。新增定向测试先 **1 failed / 23 skipped**，明确证明 archive 在 timeout 前已经发出；由于 GitNexus transport closed，本次共享归档入口按 **CRITICAL** 保守影响级别处理。
- **最小修复**：只有调用方提供 daemon observation callback 且首次状态为 `stopping` 时，才以 250ms 串行轮询同一加密 Machine RPC，最长 12 秒；只上报状态变化，并在 `exited/timeout/not-found`、RPC 错误或时间上限终止。无 observer 调用仍保持一次请求，Server archive fallback、legacy fallback 与最终 `archived` 投影均未改变。定向 ops **24/24**、App 全量 **194 files/1201 tests**、TypeScript 均 exit 0。
- **真实 Web 验证**：隔离 authenticated 环境 `stout-valley` 应用 43 migrations，创建真实 Codex session；只对隔离 runner 使用 SIGSTOP，使生产 daemon 自身的 10 秒 SIGTERM deadline 真实到期并记录 `timeout`，随后由 daemon 对已确认 PID 执行强制终止。为保留观察窗口，仅把隔离环境 `/archive` 响应延迟约 8 秒，没有注入 lifecycle、RPC、DOM 或 UI 状态；物理 mouse down/up 触发真实 Pressable 后，Header 显示 `Local runner stop timed out`，page errors 为 0。截图 `docs/audits/evidence/2026-07-15-lifecycle-timeout-web.png`，SHA-256 `e4787891379327f4b8a5c309f34d4d9a5e44710b71c38113fdff3c8f6f485c50`。
- **清理与剩余边界**：隔离 daemon list、runner/app-server 孤儿均为 0，浏览器、环境已 down/remove；生产 systemd daemon PID 3111921、runner 2072452/1687829 与三条 8443 ESTAB 未受影响。该证据只关闭真实 authenticated Web timeout 子项；Android/iOS 原生真实 RPC 时序、TalkBack/VoiceOver、macOS/Windows、有效 Provider 和 protected runner 仍开放，CLI-REL-007/UX-A11Y-001 保持 In Progress。机器证据为 `docs/audits/evidence/2026-07-15-lifecycle/89-real-timeout-app-observation.json`。

### 2026-07-15 真实 Android timeout 与 TalkBack 闭环

- **CLI-REL-002/007、UX-A11Y-001（P1）**：首次 Android 真链路没有观察到终态，根因不是 daemon 未进入 timeout，而是 Machine RPC 默认 15 秒 ack timeout 已超过 App 当时 12 秒的总观察窗口；一次边界 ack 丢失会吃完整窗口并停留在 `stopping`。GitNexus transport closed，无法取得共享 RPC/归档入口的调用图，因此本批按 **CRITICAL** 保守影响级别执行，只扩展显式调用方 timeout 与有界恢复语义。
- **TDD 与最小修复**：RPC/ops 定向测试先 **2 failed / 34 passed、exit 1**，证明自定义 deadline 未生效且一次瞬时轮询错误会过早返回。新增 `RpcCallOptions.timeoutMs`，统一限制在 250ms..15s；生命周期轮询使用每次 1.5 秒 ack deadline、15 秒总窗口，并在瞬时错误后继续有界重试。随后详情页保留本地 daemon lifecycle feedback，使用可见 banner、`accessible=true`、`accessibilityRole=text`、`accessibilityLiveRegion=polite` 与明确 label；`timeout/not-found` 在导航前保留 1.5 秒，正常终态仍保持 50ms。最终定向 **4 files / 45 tests**；统一回归 App **195 files / 1210 tests**、环境策略 **27/27**、App typecheck 均 exit 0。
- **真实 Android 验证**：使用 `artifacts/agenthub-preview-x86-64-20260715-1228.apk`（SHA-256 `120a181a…c1ead5`）连接隔离 authenticated 环境 `sharp-frost`。TalkBack 在动作前启用；真实 runner PID 1510862 被暂停后，12:39:16.608 收到 SIGTERM，12:39:26.610 进入 timeout 并由 daemon 确认升级 SIGKILL，12:39:26.634 daemon archive fallback 到达 Server，12:39:28.290 TalkBack 为终态 live-region 请求 speech audio focus，12:39:28.367 Native 页面明确显示 `Local runner stop timed out`，12:39:31.910 回到 Terminals，daemon list 为空且 PID 不存在。三帧截图分别固化 stopping、timeout、archived，APK 构建 **1701 tasks / exit 0**。
- **证据边界**：这关闭 Android 真实 RPC 时序与 TalkBack live-region activity 子项，不再依赖 Preview-only 状态夹具。Android logcat 不暴露合成 utterance 文本，因此由真实 Native 终态截图与 accessibilityLabel/live-region 测试交叉证明精确内容；iOS VoiceOver 仍是独立平台门槛。macOS/Windows、有效 Provider/Vault 和 protected runner 也仍开放，CLI-REL-007/UX-A11Y-001 保持 In Progress。机器证据为 `docs/audits/evidence/2026-07-15-lifecycle/90-real-android-timeout-observation.json`。

### 2026-07-15 Daemon cleanup watchdog 预算与错误隔离

- **CLI-REL-003（P1）**：`runDaemonCleanup` 有 7 个串行 phase，每项默认最多 250ms，因此有界最坏窗口为 1750ms；`createShutdownWatchdog` 却在 1000ms 触发强制退出，多个连续 hang 时可能在 `cleanupDaemonState`/`releaseDaemonLock` 获得执行机会前截断进程。另一个独立缺陷是 `onError` 自身抛错会逃出 catch，阻断所有后续 cleanup。GitNexus resource/query 以及两个目标 symbol 的 upstream impact 均因 `Transport closed` 失败，故按 **CRITICAL** 共享终止路径保守处理。
- **TDD 与最小修复**：新增组合测试先得到 **2 failed / 4 passed、exit 1**，分别证明 reporter failure 中断 cleanup 和默认 watchdog 在 7 个 bounded hang 完成前已触发。实现只把 error reporting 包为不可中断的 best-effort，并把默认 watchdog 从 1000ms 调为有限的 2500ms，高于 1750ms 最坏预算；没有放宽任何 cleanup step timeout，也没有改变 systemd `KillMode=process` 或 runner 生命周期。GREEN 定向 **2 files / 6 tests**；CLI full unit **109 files / 753 tests**、build/typecheck 均 exit 0。
- **真实进程验证**：最终构建前停止 systemd daemon，两个 runner PID 2072452/1687829 保持；新 bundle daemon PID 1596274 在 12:58:54.704 收到 SIGTERM，12:58:54.821 已记录 `Cleanup completed`，真实正常清理耗时约 116ms。全量测试后再次启动为单 daemon PID 1609846，并收养相同两个 runner；连接稳定后 daemon 与两 runner 各有一条 8443 ESTAB。首次 RED 构建曾在旧 daemon 在线时产生瞬时缺入口窗口，既有 bundle safety 正确拒绝并恢复旧 bundle、没有重启或丢 runner；后续构建全部遵循 stop/build/start。
- **剩余边界**：Linux 单步失败、hang 与 reporter failure 子风险关闭；破坏性 Linux 文件系统注入随后由第 92 号证据闭合。macOS/Windows 仍属独立平台门槛，因此 CLI-REL-003 保持 In Progress。机器证据为 `docs/audits/evidence/2026-07-15-lifecycle/91-daemon-cleanup-watchdog-budget.json`。

### 2026-07-15 Daemon state owner 与文件系统失败恢复

- **CLI-REL-003（P1）**：lock release 已比较持有 FileHandle 时记录的 nonce 与当前 lock owner，但 state cleanup 仍无条件 unlink。旧 daemon 在检测到 replacement owner 后进入 shutdown 时，仍可能删除新 daemon 的 `daemon.state.json`，使存活 daemon 控制面失去可发现性。GitNexus 对 `cleanupDaemonState`/`clearDaemonState` 的 upstream impact 均因 `Transport closed` 失败；人工枚举确认调用点为正常 shutdown、bundle replacement 与已确认 stale 的 CLI 清理，按 **CRITICAL** owner 边界处理。
- **RED→GREEN**：隔离 HOME 的 replacement-owner 测试先 **1/1 failed**，明确旧 owner 删除了新 state。`cleanupDaemonState` 新增可选 expected owner nonce；正常 shutdown 和 bundle replacement 必须传自己的 nonce，missing/corrupt/different owner 一律拒删。只有在 PID/start-time/exe/cmdline ownership 已判断 missing/mismatch 的 stale CLI 分支继续使用显式无 owner cleanup。state owner 与既有 lock owner 规则因此对齐。
- **破坏性本机注入**：两个独立临时 `AGENTHUB_HOME_DIR` 从 0700 改为 0500。state unlink 失败时文件保持，权限恢复后仅同 owner 可删除；lock unlink 失败时保持 fail-closed，权限恢复后仍必须以不匹配 start marker 证明 stale 才能回收。所有目录在 `finally` 恢复 0700 并删除。最终定向 **5 files / 12 tests**、CLI full unit **110 files / 756 tests**、build/typecheck 全绿。
- **真实进程与边界**：构建前按治理流程记录并停止 daemon PID 1609846，`KillMode=process` 保留 runner 2072452/1687829；最终单 daemon PID 1656995 运行新 bundle并收养相同 runner，daemon 与两 runner 各保持一条 8443 ESTAB。Linux owner/权限失败子矩阵已闭合；macOS/Windows 仍需 protected runner 验证其文件系统与进程身份语义，CLI-REL-003 全局保持 In Progress。机器证据为 `docs/audits/evidence/2026-07-15-lifecycle/92-daemon-state-owner-and-filesystem-failure.json`。

### 2026-07-15 活跃环境日志 supervisor 与长期压力

- **ENG-ENV-001（P1）**：既有 `rotateEnvironmentLogs` 只在 Server/Web 启动前扫描历史文件。服务启动后直接持有 `stdout.log` FD，长期运行期间不再触发 rotation；删除或 rename 活跃路径也不能限制仍被 child 持有的 inode，因此此前 32MiB 静态文件压力不能证明真实 active writer 有界。GitNexus 对 `spawnService`/`rotateEnvironmentLogs` impact 均因 `Transport closed` 失败，按 HIGH 隔离环境生命周期边界处理。
- **RED→GREEN**：新测试先 **1 failed / 27 skipped**，证明没有 managed live logger。新增环境专用 detached supervisor，环境 PID 指向 supervisor 进程组，实际 Server/Web child 留在同组；`env:down` 继续使用原 SIGTERM grace 与有限升级清理整个组。supervisor 合并 stdout/stderr，默认每服务保留当前文件加 archive 共 **20×1MiB=20MiB**，每片严格不超过1MiB；启动时收敛历史 current/archive，写入前脱敏 `dev_token/dev_secret/Bearer/access token/refresh token/api key/secret`。无换行单行超过64KiB时只写固定 truncation marker并丢弃至下一换行，避免内存反压失控。
- **压力与真实环境**：功能压力写入约20KiB普通行、70KiB无换行行、历史超预算 current/`.7` archive 与旧/新凭据；在 3×1KiB 预算下最终片数2..3、每片≤1KiB、`.7` 消失、credential value 0、redaction/truncation marker 均存在。环境策略 **28/28**、环境源码单点 TypeScript exit 0。真实 server-only `warm-atlas` 应用43 migrations，supervisor PID 1720265 管理同组 service，HTTP 200，`server/stdout.log` 4921 bytes/0600；down/remove 后环境与 supervisor 全部消失。
- **生产不变量与剩余边界**：生产 systemd daemon PID 1656995、runner 2072452/1687829 与三条8443 ESTAB 未受影响。Linux active writer、敏感日志与进程组 teardown 子风险关闭；macOS/Windows 文件系统/进程组和 Docker/release runner 实际执行仍开放，ENG-ENV-001 保持 In Progress。机器证据为 `docs/audits/evidence/2026-07-15-environments/93-live-environment-log-supervisor.json`。

### 2026-07-15 Phase 1 当前源码 authenticated daemon 统一回归

- **新鲜完整回归**：共享 CLI 构建前按 `KillMode=process` 流程停止 systemd daemon，两个生产 runner PID 2072452/1687829 与其 8443 连接均保留。隔离 authenticated server-only 环境 `bold-cedar` 完成 43 个迁移、私有 CLI 构建和认证种子；daemon integration **1 file / 28 passed / 2 skipped / 30 total，exit 0，317.39s**。
- **真实覆盖**：同轮覆盖 running→stopping→exited、强制 timeout、压力/并发、Server outage cleanup、daemon adoption、加密 outbox/session-end journal replay、Server 重启后重连、单 daemon、SIGTERM/SIGKILL、三类 bundle rollback，以及真实 Codex/Claude/ACP(OpenCode) active fatal 和 Claude/ACP idle stop-session。
- **有效更新正向路径**：删除永久跳过且会改 `package.json.version`、重建共享 dist 的旧破坏性测试，替换为隔离私有 bundle 的安全正向测试。入口追加无害注释后 readiness 通过、daemon PID 切换、旧进程退出、bundle 恢复；定向 **1/1，exit 0**，并已纳入上述全套回归。生产实现没有改动。
- **跳过边界**：2 个 skip 仅为本机无 Gemini executable/有效凭据导致的 Gemini idle/fatal；不把 skip 计作通过。能力刷新同时确认 OpenClaw gateway、Vault、GitLab protected runner、macOS/iOS/Windows 工具链仍不可用，且没有输出任何凭据值。
- **清理与生产恢复**：`bold-cedar` 已 down/remove。生产 systemd daemon 恢复为唯一 PID 1832941，原两个 runner 均被收养并与 `daemon list` 一一对应；daemon 和两个 runner 各有一条 8443 ESTAB。机器证据为 `docs/audits/evidence/2026-07-15-lifecycle/94-phase1-current-authenticated-daemon-regression.json`。
- **阶段判定**：Linux 当前源码下 Codex/Claude/ACP 生命周期、恢复和有效 bundle replacement 子矩阵再次闭合；Phase 1 仍处于收尾，剩余有效 Gemini active、live OpenClaw、macOS/Windows、iOS VoiceOver/native RPC、Vault、protected GitLab/registry/admission 外部门槛，不能提前标记 Closed。

### 2026-07-15 10k 消息增量热路径第二阶段

- **APP-PERF-003 根因**：此前虽已把排序/展示投影改为增量，但每条实时消息仍展开复制完整 `messagesMap`，并对完整有序历史递归扫描 running tool；10k 会话仍保留两次 O(history) 工作和显著短命分配。
- **TDD 与实现**：RED **3 failed/4 passed** 固定全历史 map/计数缺口。第一次仅把原生 `filter` 改为 JS 流式循环，三次 p95 为 -6.2%～+0.6%，因无稳定收益被撤回。最终将 `messagesMap` 明确为 SessionMessages 内部派生 ID 查询缓存，权威 UI 快照仍是每次新建的不可变 `messages` 数组和 SessionMessages wrapper；running tool 改为按 changed root id 的旧/新嵌套计数差增量维护，重复 ID 先合并到最终状态。AgentState、正常创建、历史标志、reset 与 Demo 路径均补齐计数。
- **性能结果**：Node 25.1.0、10,000 消息、200 次单条 replacement，新鲜 legacy cold/p50/p95 为 **6.811/4.672/5.883ms**，当前为 **1.794/0.219/0.477ms**，p95 提升 **91.9%**；强制 GC 后保留 heap **561,904→205,984 bytes（-63.3%）**。此前三次同实现 p95 提升 92.1%～92.4%。
- **门禁与边界**：定向 **2 files/16 tests**、App typecheck、App 全量 **195 files/1213 tests** 均 exit 0。证据 `docs/audits/evidence/2026-07-15-perf/95-message-index-hot-path.json`。该批关闭每次更新的 map 全复制和 thinking 全历史扫描子风险；release Web 冷/热、缩放/分组头、离线/timeout、图片/字体资产与 inactive heap 压力仍开放，APP-PERF-003 保持 In Progress。

### 2026-07-15 authenticated/release Web 性能矩阵与离线分页背压

- **真实 10k 长会话**：隔离 authenticated 环境 `vivid-grove` 应用 43 个迁移，以新 E2EE 性能夹具写入 10,000 条消息（100×100 batches）。桌面初始一页 ready 为 **971.5ms / DOM 326 / Heap 91,468,119 bytes / 1 GET**；完整滚动到 `performance message 1` 为 **100 GET、DOM 945、最终 Heap 359,788,131 bytes**，观察峰值 **517,285,763 bytes**，随后自然 GC 样本降到 240,595,203 bytes。390×844 移动首屏为 **1,091.4ms / DOM 323 / Heap 74,304,442 bytes / 1 GET**。这证明 DOM 虚拟化有界，但解密历史与状态保留仍有显著 heap 压力，不能据此关闭 inactive heap 项。
- **离线 RED→GREEN**：真实浏览器断网并停留在历史边界时，约 6.3 秒出现 **35 次相同 `before_seq=9903` GET**；缓存的最新 100 条仍可读、page errors 为 0，但弱网会形成请求风暴。新增 per-session `PaginationRetryGuard`：Web 明确 offline 时不入队，在线终态失败使用 1s→30s 有界退避，成功、删除 session、切换/关闭账号均清理状态。TDD 先因模块不存在 **1 suite failed / exit 1**，GREEN 定向 **3 files/11 tests**；同一真实离线动作变为 **0 requests**，恢复联网后继续加载且 cursor 单调前移。
- **release 冷/热与预算**：production export exit 0，**57 JS bundles / 42 assets / 14,748,131 bytes**；三个启动脚本 raw **6,381,428**、gzip **1,551,073 bytes**，仍通过 1.48MiB 门禁，但裕量仅 **819 bytes**。无 gzip 的本地静态服务冷启动为 **225.2ms / 19 resources / raw transfer 10,002,034 bytes / Heap 18,263,737 bytes**，热缓存刷新为 **77.8ms / transfer 20,210 bytes / Heap 23,585,278 bytes**。未认证首页仍加载 932,122-byte libsodium chunk、Ionicons/FontAwesome 及多套完整 IBM Plex 字体和大 PNG；`/dev` 为 Unmatched Route，没有开放开发页面。
- **回归与剩余风险**：App typecheck exit 0，完整回归 **196 files / 1,216 tests / 0 failed / 0 skipped**。GitNexus query 及 `loadOlderMessages`、`fetchOlderMessages`、`beginAccount`、`shutdown` impact 均因 `Transport closed` 失败，本批按 HIGH 共享同步路径保守回归。浏览器 zoom 快捷键在 headless 环境未改变 DPR/viewport，因此没有用 CSS zoom 冒充证据；该批首次发现的成功分页连续预取随后由第97号证据关闭。真实 zoom/分组头、确定性 timeout 页面门禁、inactive-session heap 和 release CPU/heap profile继续开放。完整证据与五张截图索引见 `docs/audits/evidence/2026-07-15-perf/96-authenticated-release-web-matrix.json`。

### 2026-07-15 用户手势驱动的历史分页上界

- **APP-PERF-002/003（P2）**：第96号联网恢复验证发现，保持在历史边界会在一次操作后自动拉取9个不同 cursor；虽不是重复请求，仍会放大带宽、解密和 heap。新增 `HistoryPaginationGate`，每次成功启动一页后必须等该页结束并观察到新的 Native drag/momentum 或 Web wheel/pointer/keyboard 手势才可再取一页；layout、列表追加和程序化 scroll 不能自行解锁，切换 session 会 reset。
- **TDD 与真实门禁**：模块不存在时定向 **1 suite failed / exit 1**；GREEN 联合 **3 files/8 tests**。隔离 authenticated `sharp-crater` 再写入10,000条E2EE消息：一次手势后连续45次保持边界只请求 `before_seq=9903`；再连续45次无手势仍为 **1 request**；第二次手势后才请求 `9803`，页面继续显示下一页。offline 回归45次边界保持仍为 **0 request** 且缓存可读。
- **统一回归与预算**：App typecheck、完整 **197 files/1,219 tests/0 skipped** 均 exit0；production export **3,921 modules/57 JS/42 assets/14,749,014 bytes**，启动 raw **6,381,428**、gzip **1,551,069 bytes**，以 **823 bytes** 裕量继续通过，分页门禁位于 lazy Session chunk，没有扩大 bootstrap raw。GitNexus 对 `handleEndReached`/`handleScroll` impact 因 `Transport closed` 失败，按 HIGH UI长会话路径完成全量+真实页面复核。首次清理过早删除环境目录，导致无子进程 `npm env:down` wrapper 及 server/Web `serviceSupervisor` 进程组残留；记录 PID/PGID 后全部仅用 SIGTERM 退出，未使用 SIGKILL，后续清理改为先确认服务收敛再 remove。生产 systemd daemon PID1832941、runner2072452/1687829及三条8443连接保持。证据 `docs/audits/evidence/2026-07-15-perf/97-user-gesture-pagination.json`。

### 2026-07-15 消息加载超时可恢复状态（证据 98）

- **APP-PERF-003 / APP-REL-001（P2/P1）**：RED 证明明确 `TimeoutError` 仍被通用有界重试放大，而初次消息失败只会留下无限 ActivityIndicator。当前明确超时不再进入通用重试，429/5xx/普通网络失败原有边界保持；消息存储增加可恢复 `loading|ready|timeout|network` 投影，成功、重试、取消和账户 reset 均清理错误。
- **真实 Web 验证**：authenticated `gentle-meadow` 仅在真实 browser fetch 边界持有目标 E2EE 消息请求，不注入 DOM/store/明文；15s AbortSignal 后总 attempt **1**，页面显示 polite live region、`Connection timed out` 和最小44px `Retry`。恢复真实 fetch 并物理点击后2.5s内错误消失、消息恢复。定向 **5 files/22 tests**、App **198 files/1,224 tests**、typecheck 均 exit0；production **3,922 modules/57 JS/42 assets/14,752,045 bytes**，bootstrap gzip **1,551,373/余519 bytes**。证据、指标和截图哈希见 `docs/audits/evidence/2026-07-15-perf/98-timeout-recovery.json`。超时子风险关闭；zoom/分组头、inactive heap、资产初始化和 release profile 仍开放。

### 2026-07-15 libsodium 按需初始化（证据 99）

- **APP-PERF-003 / APP-REL-001 / APP-SEC-004（P2/P1/P0）**：旧 Web adapter 虽使用 dynamic import，但模块顶层立即构造 `ready` promise，且 RootLayout 在读取凭据前无条件 await，导致未认证首页也立即下载932KB sodium并继承不必要的crypto failure boundary。RED **2 files/2 failures**锁定延迟import、QR readiness及未认证边界。
- **最小实现**：Web adapter 只在首次读取 `ready` 时创建并共享 import promise，其他crypto方法在ready前继续fail closed。Root只加载字体/翻译/凭据；`Encryption.create` 统一保证authenticated E2EE ready，手动密钥和QR恢复在进入各自流程时按需准备。不改变memory-only登录、E2EE密钥语义或Amber Crystal加载体验。
- **真实页面与门禁**：`calm-beacon` 未认证首页libsodium **0 requests**、DOM71/Heap28,326,359；物理进入 `/restore` 后才产生 **1 request** 并显示1个QR SVG；authenticated URL按需 **1 request** 后进入工作台，local/session storage无auth key且URL已清理。定向 **4 files/9 tests**、App **199 files/1,226 tests**、typecheck全绿；production **3,922 modules/57 JS/42 assets/14,752,288 bytes**，bootstrap gzip **1,551,408/余484 bytes**。环境、私有daemon、浏览器和临时export均已清理，生产daemon/runner/8443不变。证据见 `docs/audits/evidence/2026-07-15-perf/99-lazy-libsodium-initialization.json`。根初始化等待子风险关闭；932KB chunk减重、字体/图片和其他Phase2性能项仍开放。

### 2026-07-15 根字体资产边界收敛（证据 100）

- **APP-PERF-003 / APP-REL-001（P2/P1）**：真实未认证首页基线为22个资源、11次字体请求；Root无条件注册Space Mono、两套italic、Mono semibold、无产品调用的Bricolage及FontAwesome。生产源码只实际依赖IBM Plex Sans regular/semibold与Mono regular；其余face增加启动阻塞和导出体积。
- **最小实现与TDD**：不改Typography API、任何产品组件或Amber Crystal视觉，只把Root预加载收敛到三种核心face；FontAwesome恢复Expo图标组件本身的按需加载，Tauri保持非阻塞行为。GitNexus query/impact/detect均因`Transport closed`失败，根启动按HIGH、全局Typography按CRITICAL处理；RED **1 file/2 failures**，GREEN定向 **3 files/9 tests**。
- **真实页面与门禁**：`clever-dune` 未认证首页资源 **22→16**、transfer **5,076,436→4,204,509 bytes（-871,927）**；QR仍显示SVG与返回图标，authenticated工作台截图与证据99逐字节相同且auth不落盘。App **200 files/1,228 tests/0 skipped**、typecheck全绿；production **3,913 modules/57 JS/36 assets/13,873,273 bytes**，较证据99减少 **879,015 bytes（-5.96%）**，bootstrap gzip **1,545,060/余6,832 bytes**。浏览器、私有daemon、环境和临时export均已清理，生产daemon PID1832941、runner2072452/1687829与三条8443连接不变。证据见 `docs/audits/evidence/2026-07-15-perf/100-root-font-asset-boundary.json`。根字体子风险关闭；Ionicons、PNG、release CPU/heap、缩放/分组头与inactive heap保持开放。

### 2026-07-15 inactive 会话消息淘汰与 50×10k 堆压力（证据 101）

- **APP-PERF-003（P2）竞态**：`applySessions` 已将缓存限制为全部 active 加最近20个 inactive，但迟到的 realtime message、loaded、load-error 或 history-state 更新可以在下一次 session refresh 前重新创建已淘汰的第21个状态。这既绕过 heap 边界，也让已清出的解密历史/reducer 状态重新驻留。GitNexus 对选择器和四个共享 action 的 impact 均因 `Transport closed` 失败，本批按 **CRITICAL** 同步存储路径保守处理。
- **TDD 与最小修复**：新增四类迟到动作，首轮三种状态动作均得到 expected20/actual21 的 RED；最小实现集中复用既有 active+20 inactive 选择器，只对已知 inactive 更新执行重算，active 和尚未取得 session metadata 的入口保持原有 O(1) 路径。E2EE、分页、active turn 所有权、路由和产品语义不变。GREEN 定向 **3 files/13 tests**；App typecheck、完整 **201 files/1,232 tests/0 skipped** 均 exit0。
- **独立堆基准**：Node v25.1.0 下用隔离 `--expose-gc` 子进程分别测量50与20个 inactive 状态，每个均为10,000条消息。总500,000条的 heap 为 **128,926,256 bytes**，保留最近20个/200,000条为 **52,138,176 bytes**，减少 **76,788,080 bytes（59.6%）**；保留决策耗时 **0.209ms**。同轮10k单会话200次 replacement p95为 legacy **7.38ms**、current **0.627ms（-91.5%）**。
- **真实 Web 与边界**：authenticated-empty `sharp-frost` 完成43个迁移，Terminals 正常渲染并切换 Settings，认证 query 自动从URL移除，API 200且page errors为空。该夹具没有伪造多会话，因此不宣称真实点击切换覆盖；多会话语义由50×10k独立基准和四条存储竞态测试闭合。浏览器/环境已清理，生产daemon PID1832941、runner2072452/1687829与三条8443连接不变。证据见 `docs/audits/evidence/2026-07-15-perf/101-inactive-session-retention.json`。inactive resurrection/独立 heap 子风险关闭；当前可见或active的单个超长会话仍可合法主导heap，release CPU/heap、真实zoom/分组头、Ionicons与图片仍开放。

### 2026-07-15 真实浏览器缩放、Git rename 预取与 production CPU/heap profile（证据 102）

- **APP-PERF-002/003（P2）真实页面矩阵**：authenticated `jolly-river` 应用43个迁移并写入真实E2EE 10k消息；100%下DOM456、heap99,801,760 bytes。第二个真实Git会话含32个staged、50个unstaged项目；通过X11直接驱动Chrome窗口缩放和鼠标滚轮，而非CSS zoom或DOM注入。100%/125%/200%分别得到DPR **1/1.25/2**、viewport宽 **1050/840/525**；分组头在scrollTop2400仍可见，200%下列表client/scrollHeight为288/6397且无页面横向溢出。
- **新发现 APP-PERF-002 功能缺陷**：真实rename夹具暴露预取旧路径并产生20次ENOENT。porcelain v2 type-2记录顺序是目标新路径在前、原路径在tab后，`parseRenameCopy`此前反向赋值，影响标题、diff/stage/discard和预取。单测先 **0/1、exit1**，最小修复后定向 **5 files/30 tests**；真实页面热更新后9次读取全部命中新路径、失败0。GitNexus impact持续`Transport closed`，故按HIGH共享Git路径保守执行完整回归。
- **production profile与预算**：production export为 **3,913 modules/100 files/13,873,360 bytes**；三个bootstrap script raw **6,367,690**、gzip **1,545,124**，预算余量仅 **6,768 bytes**。本地无压缩静态服务的未认证production根冷启动为 **275.6ms/12 resources/8,190,410 transfer bytes/heap16,990,959 bytes/25,035 CPU events**，暖刷新为 **130.2ms/18,110 transfer bytes/heap24,916,693 bytes/17,939 CPU events**，两份`.cpuprofile`和截图均已保存。production按安全设计拒绝dev query credential，因此本轮未把未认证root冒充authenticated release 10k profile。
- **回归、清理与剩余风险**：App全量 **202 files/1,233 tests**、typecheck、production export/budget均exit0。两个私有runner均通过daemon stop-session退出，浏览器、Xvfb、私有daemon、环境和临时export已清理；production systemd daemon PID1832941、runner2072452/1687829与三条8443 ESTAB保持不变。证据 `docs/audits/evidence/2026-07-15-perf/102-real-zoom-release-profile-and-git-rename.json`。真实缩放/分组头和未认证release根profile子风险关闭；APP-PERF-002仍缺更大真实文件列表RPC/HAR与独立峰值heap，APP-PERF-003仍缺authenticated production-equivalent active 10k profile、Ionicons和大PNG，保持In Progress。

### 2026-07-15 未认证 Ionicons 首屏与 Header 可访问边界（证据 103）

- **APP-PERF-003 / UX-A11Y-001**：production未认证首页只为HomeHeader的server轮廓加载完整389,724-byte Ionicons字体。静态边界先RED 1/3；最小实现以`react-native-svg`重画现有add/server轮廓，保持24/28px、主题色、32px视觉容器、hitSlop和导航不变。真实开发页首次还抓到`accessible={false}`被传为非布尔DOM属性的React warning，移除后overlay消失；随后为两个Pressable复用既有i18n补上`New session in this project`和`Server Configuration`可访问名。
- **真实Web与收益**：authenticated `fair-valley` 完成43迁移，工作台Header图标、连接态和导航外观正常；production登录根从 **12 resources/8,190,410 transfer bytes/1次Ionicons** 降为 **11/7,800,894/0次**，减少 **389,516 bytes**，服务器圆柱图标与证据102视觉一致。authenticated页仍因其他功能图标请求Ionicons，未冒充全局移除。
- **门禁与边界**：定向 **2 files/4 tests**，App完整 **202 files/1,234 tests**、typecheck、production export/budget均exit0；最终export **100 files/13,874,059 bytes**，bootstrap raw **6,368,389**、gzip **1,545,078/余6,814**。浏览器、私有daemon、环境、静态服务均清理，生产daemon/runner/8443不变。证据 `docs/audits/evidence/2026-07-15-perf/103-unauthenticated-ionicons-boundary.json`。未认证首屏字体请求关闭；authenticated Ionicons完整迁移、389,724-byte export资产、大PNG与active 10k release profile仍开放。

### 2026-07-15 运行时 PNG 内容哈希去重（证据 104）

- **APP-PERF-003（P2）**：静态require审计按PNG内容SHA-256分组，RED **0/1** 精确发现 `agenthub-logo-light.png` 与 `agenthub-logotype-dark.png` 字节完全相同，但Metro按两个文件名各导出574,453 bytes。最小修复只让light-theme welcome复用canonical `agenthub-logo-light.png`；原品牌源文件和Native/release metadata不删除，不重绘、不重新压缩，也不改变主题选择。
- **产物与真实视觉**：production export **100→99 files、13,874,059→13,299,410 bytes**，减少 **574,649 bytes**；bootstrap gzip轻微波动为 **1,545,104/余6,788**。production根仍为11 resources/7,800,889 transfer bytes，改动前证据103与改动后截图SHA-256均为 `c364210c...f6240`，文件逐字节一致。authenticated `brave-oasis` 43迁移后工作台DOM107、heap33,014,713 bytes、page errors 0。
- **门禁与剩余项**：定向 **4 files/5 tests**、App完整 **203 files/1,235 tests**、typecheck、production export/budget均exit0。浏览器、环境、私有daemon、静态服务和临时export均清理，生产daemon PID1832941、runner2072452/1687829与三条8443连接不变。证据 `docs/audits/evidence/2026-07-15-perf/104-runtime-image-alias-deduplication.json`。重复PNG别名子风险关闭；非重复settings banner/theme logo、authenticated Ionicons和active 10k release profile仍开放。

### 2026-07-15 authenticated production 10k CPU/heap profile（证据 105）

- **APP-PERF-003（P2）生产态补证**：production export只连接隔离loopback Server，通过产品正式的“Restore with Secret Key Instead”流程进入已认证工作台，再打开真实E2EE **10,000消息** active会话；没有使用dev query、伪造store或把开发构建冒充production。密钥只在瞬时shell变量内完成base64url转换，localStorage无auth条目、sessionStorage为空，刷新后按已接受的memory-only策略重新登录。
- **冷/暖结果**：冷态由浏览器轮询“最新消息真实出现在DOM”得到 **583.3ms**，此时DOM **327**、used/total JS heap **29,539,160/35,063,216 bytes**；网络只取最新 **100** 条消息（29.2ms）、SessionView chunk（190,241 transfer bytes）和Octicons字体（69,736 transfer bytes），没有读取全部10k。完全缓存后的返回为 **316.0ms**、DOM **863**、heap **36,750,002 bytes**、新增资源请求 **0**；首次回访只出现一次 `after_seq` 增量请求。冷/暖截图逐字节相同，CPU trace分别保存 **159,952/2,982 events**。固定观察等待只用于trace采集，不被冒充为路由延迟。
- **构建、回归与边界**：新鲜production export **99 files/13,299,433 bytes**，bootstrap raw **6,368,216**、gzip **1,545,121**、预算余量 **6,771 bytes**。证据104后没有源码变化，沿用同一当前工作树的新鲜App **203 files/1,235 tests**与typecheck全绿结果，本轮另以production export/budget exit0补证。性能session先经daemon `stop-session`收敛到空列表，再关闭全部浏览器、静态服务、私有daemon和隔离环境；生产daemon PID1832941、runner2072452/1687829与三条8443连接不变。证据 `docs/audits/evidence/2026-07-15-perf/105-authenticated-production-10k-profile.json`。authenticated production-equivalent active 10k profile子风险关闭；authenticated Ionicons、非重复大PNG，以及APP-PERF-002的大文件列表RPC/HAR与独立峰值heap仍开放。

### 2026-07-15 Ionicons Web 字体子集与原生隔离（证据 106）

- **APP-PERF-003 / UX-A11Y-001（P2）**：保留全部现有Ionicons组件、glyph codepoint、尺寸、颜色与交互，Metro只在`platform === 'web'`时把字体解析到checked-in子集；iOS/Android继续使用上游完整字体。生成器扫描非测试runtime源码，经上游glyphmap收集 **262** 个图标名，并写入源字体/子集SHA-256 manifest，防止新增字面量图标静默缺字。
- **真实失败先行**：初版物理文件名`Ionicons.web.ttf`被Metro把`.web`解释为平台后缀，development实际请求不存在的`Ionicons.ttf`；`document.fonts`为`error`，Settings行图标和底栏图标全部缺失。真实页面门禁阻止了错误完成声明。改成平台中性的`IoniconsSubset.ttf`后，authenticated `witty-dune`显示账户、API凭据、外观、chevron和底栏图标，字体状态`loaded`、实际传输 **84,680 bytes**、page errors 0；截图 `docs/audits/evidence/2026-07-15-perf/106-authenticated-ionicons-subset.png`。
- **产物与回归**：字体 **389,724→84,380 bytes（-305,344 / -78.35%）**；production export **13,299,433→12,994,040 bytes（-305,393）**，完整389,724-byte资产不存在。bootstrap raw **6,368,167**、gzip **1,545,101**、余量 **6,791 bytes**。RED **0/2**，GREEN定向 **2 files/5 tests**，App完整 **204 files/1,237 tests**、typecheck、export/budget均exit0。浏览器、私有daemon、环境、临时export和临时fonttools均清理，生产daemon/runner/8443不变。证据 `docs/audits/evidence/2026-07-15-perf/106-ionicons-web-font-subset.json`。authenticated完整Ionicons字体子风险关闭；非重复大PNG和有界E2EE兼容前提下的libsodium评估仍开放。

### 2026-07-15 Provider active-turn 真值门禁与本机六场景矩阵（证据 107）

- **CLI-REL-001/005 / ENG-CI-001（P1）门禁缺陷**：旧 protected verifier 只匹配5个模糊测试名；Gemini fatal测试在真实子进程出现后立即SIGKILL，没有证明Provider请求进入active turn。2026-07-14使用synthetic-invalid key的证据因此只证明“真实Gemini进程fatal→归档”，不能证明“有效凭据active-turn fatal”。GitNexus对`checkProviderMatrixOutput` impact仍为`Transport closed`，按 **CRITICAL** 发布门禁处理。
- **RED→GREEN**：verifier先 **3 passed/2 failed**，CI policy先 **3 passed/1 failed**。当前默认矩阵精确要求Codex、Claude、ACP、Gemini各自idle/active共8个完整测试名，missing/skip/pass+skip均fail closed；Gemini active只有在Server `thinking=true`且E2EE消息已有`turn-start`后才允许SIGKILL，终态还必须出现唯一`turn-end(failed)`。`cli:gemini-integration`和`cli:provider-matrix`都运行Gemini idle+active，主矩阵另补Codex active与Claude pre-backend idle。
- **真实本机矩阵与严格边界**：`integration-authenticated`自行创建server-only `crisp-mountain`，应用43 migrations并使用private CLI bundle。Codex idle/active、Claude pre-backend idle/active、ACP/OpenCode idle/active **6/6通过**；文件总计 **1 passed、6 passed/24 skipped/30 total、119.19s、exit0**。严格默认verifier随后以exit1精确拒绝两个Gemini skip，可用六场景子集则exit0；因此没有把partial冒充full。原始安全日志 `docs/audits/evidence/2026-07-15-lifecycle/107-local-provider-phase-matrix.log`。
- **统一回归与进程治理**：verifier **5/5**、CI/release policy **2 files/9 tests**、CLI typecheck均exit0；`test:unit`完成build并通过 **111 files/758 tests**。重建前停止systemd daemon PID1832941，`KillMode=process`保留runner2072452/1687829；重启后唯一daemon PID41433收养两runner，daemon list/ps一一对应且三条8443 ESTAB。证据 `docs/audits/evidence/2026-07-15-lifecycle/107-provider-active-phase-gate-and-local-matrix.json`。Phase 1仍缺有效凭据Gemini active、live-gateway OpenClaw、macOS/Windows和protected GitLab新鲜artifact，保持收尾而非Closed。
### 2026-07-15 OpenClaw live active-turn 发布门禁（证据 108）

- **CLI-REL-001/005 / ENG-CI-001**：审计发现 protected Provider job 只要求 OpenClaw integration 进程 exit 0 并宽泛排除 `Skipping`，没有精确要求 live gateway active turn 的终态闭环。RED 为新验证器模块缺失 **1 failed**、CI policy **3 passed/1 failed**。
- **最小实现**：新增精确双场景验证器；live active 场景通过 daemon 创建真实 OpenClaw session，写入 E2EE 长响应请求，stop-session 前必须观察 `thinking=true`、加密 `turn-start` 且尚无 `turn-end`，结束后必须是唯一 `turn-end(cancelled)`、Server `active=false/thinking=false` 与加密 metadata `archived/archivedBy=cli`。protected job 只运行并验证这两个明确场景，missing/target skip/pass+skip/runtime self-skip 均失败。
- **验证与真实边界**：验证器 **9/9**、CI/release policy **9/9**、OpenClaw unit **2/2**、CLI typecheck 均 exit 0。本机无 live gateway 的真实 integration 探针仍得到 Vitest **7 skipped/exit 0**，但新验证器按预期 **exit 1**；这只证明防假绿，不冒充 OpenClaw 通过。含一次性认证 URL 的原始日志已删除，`nimble-spring` 私有 Server/daemon 已 down/remove，无端口或孤儿进程。生产唯一 systemd daemon PID **131842** 收养 Runner **2072452/1687829**，三条 8443 ESTAB。完整机器证据见 `docs/audits/evidence/2026-07-15-lifecycle/108-openclaw-live-active-fail-closed-gate.json`；有效 Gemini、真实 live OpenClaw、macOS/Windows、iOS、Vault 与 protected GitLab artifact 仍开放。

### 2026-07-16 integration environment 父级清理（证据 109）

- **ENG-ENV-001 / ENG-CI-001 / CLI-REL-006（P1）**：真实 OpenClaw 全文件 skip 暴露 `setupFiles` 创建环境、仅靠 worker `afterAll` 清理的生命周期缺口。worker `exit` 与 `disconnect` 两种 fallback 虽各自单元转绿，真实运行仍分别遗留 `cool-star`、`warm-forest`，因此均已撤回；最终由 Vitest `globalSetup` 主进程持有 0600 环境名 JSONL 清单并在全局 teardown 逐项清理。
- **崩溃与失败边界**：缺少主清单时 worker 先销毁再 fail closed；stop 失败仍尝试 remove，单项失败不阻断后续项。JSONL 尾部截断先 RED **1 failed/3 passed**，修复后仍清理所有有效项、删除清单并以 `AggregateError` 报告损坏。定向 **2 files/6 tests**、CLI typecheck及全量 `test:unit` **112 files/762 tests** 均 exit 0。
- **真实验证与阶段边界**：无 gateway 的 `deft-lagoon` 为 **1 file/7 skipped/exit0**，但主进程仍停止2个隔离进程并删除环境；正常 journal 场景 `plush-island` **1 passed/1 non-target skipped/exit0** 后同样无目录/进程残留。敏感原始日志已删除。重建前停止 daemon PID583852 并保留两个 Runner，最终唯一 systemd daemon PID639022 收养 Runner2072452/1687829，三条8443 ESTAB。机器证据 `docs/audits/evidence/2026-07-16-lifecycle/109-integration-environment-parent-owned-cleanup.json`；该项关闭 Linux 本机测试环境父级清理子风险，不关闭外部 Provider/跨平台门槛，Phase 1 继续收尾。

### 2026-07-16 authenticated Web 共享动作菜单无障碍收口

- **UX-A11Y-001（P1）**：真实 Devices 页确认文件传输图标无名称、通用 `Project Actions`、菜单初始焦点落到 generic/backdrop、键盘 Enter 以 `(0,0)` 将菜单放到左上角，以及连接/同步状态缺少显式 live/busy 语义。`ActionMenu` 与 `getAccessibleActionProps` 的 upstream impact 分别为 **CRITICAL（21 impacted/6 flows）** 与 **CRITICAL（45 impacted/20 flows）**，因此按共享 UI 边界执行全量 App 回归。
- **RED→GREEN**：缺模块 **1 failed suite**；ARIA 映射 **2 failed/1 passed**；键盘 anchor **1 failed/5 passed**；App typecheck 另以 exit 2 找到独立 Machines 路由的第二 consumer。最小实现让 Web 菜单聚焦首个未禁用动作、背景退出 Tab 序列、Escape 恢复触发器、键盘从触发器矩形定位；菜单项、文件传输、设备动作、连接 live region 和同步 busy 状态补齐明确语义，顶部目标均达到44×44，`fileTransfers` 同步全部10种翻译。Amber Crystal 视觉和产品操作逻辑不变。
- **验证与边界**：定向 **5 files/19 tests**、App typecheck、App 全量 **205 files/1241 tests** 均 exit 0。authenticated desktop 验证首焦点/Tab循环/Escape恢复/右对齐定位、`aria-live=polite`、无浏览器错误；390×844 页面确认三处相关动作均44×44且无截断。两张截图与哈希见 `docs/audits/evidence/2026-07-16-ux/110-authenticated-web-action-menu-accessibility.json`。该批只关闭共享菜单与 Devices header 子风险；重复 CTA、全页面状态、全量 axe、320px、iOS VoiceOver/更多 TalkBack、分享和多语言旅程仍开放，UX-A11Y-001 与 Phase 1 保持 In Progress。

### 2026-07-16 Web 图片、libsodium 可行性与 10,007 文件虚拟化（证据 111）

- **APP-PERF-003 图片边界**：四个Native原图保持不变，新增Web专用256px logo/logotype与约1400×350 settings banner；运行时图片总量 **2,387,404→641,677 bytes**，节省 **1,745,727 bytes**。静态预算先以5/5 missing variants失败，再5/5转绿；production root/settings桌面与移动截图确认Amber Crystal视觉、logo比例和文字无回归。
- **APP-PERF-002 RED→GREEN**：真实10,007项Git状态使旧ScrollView全量map超过30秒无响应，renderer RSS **3,066,508KB**。首版FlatList虽把DOM降到601，却只生成1,556px滚动空间，因此继续视为RED；最终用纯row模型、稳定key、连续fileIndex和精确布局恢复 **770,554px**完整滚动空间。路由点击 **0.24s**，桌面顶部/中部/末尾DOM **602/1009/781**、Heap **74.1/43.9/44.7MB**、renderer RSS **290,604KB**；390×844移动端抵达最后文件且无横向溢出，搜索/清空恢复、真实RPC与HAR均通过。
- **libsodium边界**：932,122-byte独立chunk中核心实现约819,204 raw/281,858 gzip，承担现有Curve25519-XSalsa20-Poly1305、XSalsa20-Poly1305与Ed25519协议；WebCrypto无法等价替换。继续保持未认证根0请求、需要E2EE时按需加载。残余风险owner为AgentHub security/release maintainer，期限2026-08-15，只接受独立审计、协议完全兼容的最小构建。
- **回归、产物与清理**：定向 **4 files/12 tests**、App typecheck、App全量 **207 files/1248 tests**、production export均exit0；最终export **11,251,568 bytes**，57个JS raw **9,778,540**/gzip **2,541,085**，bootstrap raw **6,370,977**/gzip **1,546,389**，预算余 **5,503 bytes**。浏览器、私有daemon/runner、fixture、authenticated环境和临时export均已清理，production systemd daemon与runner/8443一一对应。JSON、HAR、截图与哈希见 `docs/audits/evidence/2026-07-16-perf/111-web-images-libsodium-and-10k-file-list.json`。该证据关闭APP-PERF-002，并以受控残余风险关闭APP-PERF-003；不代表Phase 0/1外部发布门槛已关闭。

### 2026-07-16 动态语言、通知文案与 320px Account 重排（证据 112）

- **UX-I18N-001 RED→GREEN**：Web此前固定`<html lang="en">`，Android拒绝通知权限时会显示三处iOS专用说明。新增浏览器安全的文档语言同步，在locale解析及英文fallback后设置BCP-47 `lang`；默认树与十份locale字典的通知说明统一改为iOS/Android均正确的平台中立文案。缺模块与文案测试先RED，最终翻译一致性在内 **3 files/7 tests** 通过。
- **320px真实reflow**：通知状态和再次请求说明允许多行；真实截图还发现长Public ID把标签挤成孤立省略点，因此将Anonymous/Public ID改为整行monospace subtitle。authenticated Web从English切换到简体中文，刷新后无凭据登录页仍为`html.lang=zh-Hans`，符合根secret只驻内存策略；重新签发一次性URL后320×800 Account页`clientWidth=320`、`scrollWidth=310`，Public ID标签和值分别为226×24与226×20，无横向溢出，页面错误为空。
- **验证与边界**：App typecheck和全量 **209 files/1254 tests/0 skipped** 均exit0；截图SHA-256、DOM坐标、RED/GREEN命令及清理记录见 `docs/audits/evidence/2026-07-16-ux/112-dynamic-lang-notification-copy-and-320px-reflow.json`。浏览器、隔离daemon和`brave-fjord`均已清理，production daemon PID639022及两个runner/三条8443连接不变。本批关闭动态lang、通知平台错配和Account窄屏重排子风险；全量硬编码字面量、十locale端到端视觉、当前build的Android拒绝权限截图、iOS VoiceOver和其余Phase 3旅程仍开放。

### 2026-07-16 文件浏览完整呈现链路国际化（证据 113）

- **UX-I18N-001 RED→GREEN**：机器详情入口、独立远端文件页、会话 `DirectoryTreeDrawer`、共享 `FilePreviewPanel`、操作菜单及文件信息仍混有中文专用字面量和英文 `Unknown error` fallback。新增边界测试先得到 **1 passed/2 failed**，随后建立 default+10 locale、每树32 keys的 `fileBrowser` 命名空间并迁移四个生产文件；四文件15 tests与共享HIGH路径九文件34 tests均通过。`FilePreviewPanel` 的GitNexus影响为HIGH（2 direct/5 impacted，覆盖SessionView与MachineFilesScreen），因此修复严格限制为展示层`t()`，未改RPC、预览策略、下载、删除或传输状态。
- **真实 authenticated Web**：`agile-mountain` 中真实设备 `yzsd-gpu-server-dev` 通过daemon RPC载入根目录；英文机器入口、空预览、`/swap.img`真实EACCES、会话文件抽屉、`.bashrc`右键菜单和参数化File information均正确呈现，page errors=0，未执行下载或删除。截图、SHA-256、DOM观察与清理记录见 `docs/audits/evidence/2026-07-16-ux/113-file-browser-i18n-journey.json`。
- **统一回归和预算**：App **558 suites/1257 tests/0 failed/0 skipped**、typecheck、`git diff --check`均exit0；production Web **3915 modules/58 bundles/35 reported assets/11,276,849 bytes**，三个bootstrap脚本raw **6,372,956** / gzip **1,546,560 bytes**，在1.48 MiB门禁下保留 **5,332 bytes** 裕量。隔离session经`stop-session`退出，浏览器/环境/私有daemon均清理；production systemd daemon PID639022、两个runner与8443连接不变量保持。
- **边界**：本证据只证明英文真实旅程和十一棵语言树的静态key parity，不冒充十locale视觉完成；单独传输页、其余production TSX字面量、offline/timeout/删除状态、Native辅助技术和当前build Android视觉仍开放，UX-I18N-001继续保持In Progress。

### 2026-07-16 传输管理器国际化、语义与菜单截断（证据 114）

- **UX-I18N-001 / UX-A11Y-001 RED→GREEN**：传输页此前混有中文状态、错误、对话框与菜单字面量，行内图标动作缺少稳定的本地化button名称。新增边界测试依次暴露中文残留、缺`transferManager`命名空间、Catalan 0%差异伪翻译和图标语义缺口；最终将呈现层迁入default+10 locale、每树79 keys的命名空间，并为暂停/继续/打开/取消/移除动作补齐语义。定向 **6 files/29 tests** 通过，传输store、下载、删除、SAF、RPC和生命周期逻辑均未改变。
- **真实 authenticated Web**：`snug-coral` 的authenticated-empty英文传输页验证五类筛选、零任务空态和管理菜单，page errors=0。首次截图发现长菜单标签被省略；共享`ActionMenu`的GitNexus影响为 **CRITICAL（10 direct/21 impacted/6 flows）**，因此未修改共享组件，仅缩短当前消费端的五项标签，最终1280×633截图全部完整。Web刷新会按已接受的memory-only root-secret策略退出登录，因此旅程采用一次性认证入口后客户端导航，不把预期重新登录误报为缺陷。
- **统一回归、预算和边界**：App **560 suites/1261 tests/0 failed**、typecheck、`git diff --check`、production export均exit0；export **3915 modules/58 bundles/35 reported assets/11,335,174 bytes**，bootstrap raw **6,377,401** / gzip **1,546,989 bytes**，在1.48 MiB门禁下余 **4,903 bytes**。环境、浏览器和私有daemon已清理，production daemon/runner不变量保持。JSON、RED/GREEN截图与哈希见 `docs/audits/evidence/2026-07-16-ux/114-transfer-manager-i18n-accessibility.json`。因空夹具未真实执行非空行、详情、暂停/继续和删除确认，十locale视觉及Native辅助技术仍开放，两个审计ID继续保持In Progress。

### 2026-07-16 传输非空、恢复、详情与删除旅程（证据 115）

- **UX-A11Y-001 / UX-FLOW-001 RED→GREEN**：文件浏览生成的`taskId`此前未被传输页消费；非空任务行、进度、筛选、详情路径和删除选择也缺少完整语义。新增边界与纯函数测试先得到 **4 failed/13 passed**，最小实现让匹配任务只自动打开一次，把任务详情点击面与右侧动作拆为同级控件，显示失败原因并补齐progressbar、tablist/selected、详情动作和checkbox名称。GREEN定向 **4 files/28 tests**，未改传输RPC、持久化格式或状态机。
- **真实DOM驱动的二次修复**：`calm-beacon` 同源Web MMKV注入六条无秘密任务后，以认证URL直接进入`taskId=failed-1`并正确打开详情。首轮DOM发现RN Web没有从`accessibilityValue`和`accessibilityState.selected`输出数值/选中ARIA；补显式`aria-valuenow/min/max`与`aria-selected`后，六进度为13/30/0/25/100/8且Failed标签状态正确。键盘Tab可分别抵达标签、详情、retry和remove，Enter打开详情，nested button计数为0。
- **真实恢复/破坏性操作和移动状态**：重新尝试失败任务真实进入store并以明确Web目录错误回到Failed；取消paused任务令Paused **3→2**并持久化cancelled；删除cancelled记录令All **6→5**且记录确实移除；本地文件删除复选框正确切换按钮含义。390×844下`clientWidth=390/scrollWidth=380`，失败原因两行可读，page errors=0。截图/哈希见证据JSON。
- **统一回归和边界**：App **560 suites/1265 tests/0 failed/0 pending**、typecheck、diff check、production export均exit0；export **3915 modules/58 bundles/35 reported assets/11,336,439 bytes**，bootstrap raw **6,378,666** / gzip **1,547,321 bytes**，预算余 **4,571 bytes**。浏览器与`calm-beacon`均删除，production daemon PID639022及runner不变量保持。本证据关闭传输非空authenticated Web子风险；Native真实远端下载/文件打开删除、TalkBack/VoiceOver、十locale视觉和全页面axe仍开放。

### 2026-07-16 核心会话入口、项目工作台与动态标签国际化（证据 116）

- **UX-I18N-001 / UX-A11Y-001 RED→GREEN**：六个核心生产文件仍包含中文专用的新建会话动态名称、项目编辑说明、设备分组、FAB、路由和Git详情。边界测试先 **4/4 failed**，随后新增`common.close`及13个动态/静态键，并在default+10 locale提供真实翻译；项目编辑和Git详情同时补齐dialog/modal、输入、关闭、保存与背景退出语义。边界+翻译parity **2 files/5 tests**、typecheck和diff check通过，六文件Han文本清零，生产清单 **23→17**。
- **真实 authenticated Web**：`fair-forest`中英文折叠配置正确命名Browse folder/Select device/Switch agent/Switch permission/Select worktree；真实Settings流程切换zh-Hans并确认重启后，memory-only认证按设计清除、`preferredLanguage`和`html.lang=zh-Hans`保留，再认证后五项均呈现中文。320×800为`clientWidth=320/scrollWidth=310`，真实设备文件页标题为“文件浏览”，桌面空工作区FAB为“开始新会话”，page errors=0。
- **统一回归、预算与诚实边界**：App **562 suites/1269 tests/0 failed/0 pending**、typecheck、diff check、production export均exit0；export **3915 modules/58 bundles/35 reported assets/11,348,767 bytes**，bootstrap raw **6,380,212** / gzip **1,547,344 bytes**，预算余 **4,548 bytes**。浏览器与环境已删除，production daemon PID639022和runner不变量保持。空环境没有可编辑项目会话或Git提交，因此这两个modal不冒充真实页面完成；截图、哈希与剩余17文件清单见证据JSON。

### 2026-07-16 共享运行时文案、纯工具边界与 Changelog 真实审计（证据 117）

- **UX-I18N-001 RED→GREEN**：官方会话接管、Changelog统计、工具状态、Android双返回、流式传输重试/下载目录和斜杠/技能建议仍含中文专用逻辑。新边界先 **4/4 failed**，随后新增26个default+10 locale键，移除`getCurrentLanguage().startsWith('zh')`二分和模块级中文模板；首轮 **5 files/25 tests**、扩展 **8 files/41 tests** 通过，生产TS/TSX含Han清单 **17→9**。
- **APP-ARCH-001 回归驱动修复**：首个App全量不是绿线：**562 suites passed/1 suite load failed/1270 assertions passed**，`androidFileIntents.test.ts`因纯`fileTransfers.ts`导入UI text/React Native runtime而无法解析。没有追加mock隐藏失败；改为纯函数显式接收私有目录fallback，翻译只留在store/App消费者。专项 **5 files/27 tests** 后全量 **564 suites/1273 tests/0 failed/0 pending**，typecheck和diff check exit0。
- **真实 authenticated Web 与新发现**：`deft-dune`真实Settings语言选择执行en→zh-Hans→en；每次重启都按memory-only策略回到登录页并重新认证。Changelog统计分别显示`17 versions / 106 updates / Latest 18`与`17 个版本 / 106 项更新 / 最新版本 18`，page errors=0。但英文页的摘要和106条历史更新仍来自中文`changelog.json`，因此正文国际化明确保持Open，英文截图本身就是反证，不能将Changelog页面宣称完成。
- **生产门禁与清理**：production export **3915 modules/58 bundles/35 reported assets/99 files/11,371,911 bytes**，bootstrap raw **6,381,638** / gzip **1,547,612 bytes**，预算余 **4,280 bytes**；浏览器、环境和私有daemon均已删除。完整命令、截图哈希、剩余9文件和开放边界见`docs/audits/evidence/2026-07-16-ux/117-runtime-copy-i18n-and-changelog.json`。

### 2026-07-16 Changelog 多语言正文、生成契约与按需分块（证据 118）

- **UX-I18N-001 内容风险关闭**：新增`CHANGELOG.en.md`英语canonical源，原`CHANGELOG.md`明确归属`zh-Hans`。生成器对默认locale、版本/日期顺序、每版change数、空摘要、重复版本和提交JSON可复现性fail-closed；142-byte manifest只携带latestVersion，英语和简中正文各自生成独立JSON。精确命中`en`/`zh-Hans`，其余8 locale明确fallback英语，不再让英文界面静默显示中文正文。
- **APP-PERF-003 未接受擦线方案**：首个功能正确的eager双locale catalog使bootstrap gzip升到 **1,550,961 bytes**、仅余931 bytes。新增bundle边界RED **4 failed/3 passed** 后，Web loader改为动态import，Native保持同一异步接口；最终production export **3918 modules/60 bundles/35 assets/101 files/11,365,693 bytes**，两个正文chunk为20,994/12,117 bytes，bootstrap raw **6,341,567** / gzip **1,539,837 bytes**，较证据117下降7,775 bytes并恢复12,055 bytes余量。
- **状态、验证与诚实边界**：页面具备loading、error、44px retry及卸载后忽略迟到结果，只有正文成功加载才标记latestVersion已读。RED首轮 **4/4**，内容GREEN **6/6**，最终定向 **2 files/11**；App全量 **214 files/1280 tests/0 failed/0 pending**、typecheck/diff/export/budget均exit0。authenticated `bold-bluff`真实证明英语只请求英语chunk、简中只请求简中chunk，17版106项正文及统计一致；语言重启按memory-only策略返回`zh-Hans`登录页，再认证后通过。真实chunk失败重试、其余8 locale专属正文、Native和辅助技术仍保持Open，完整证据见`docs/audits/evidence/2026-07-16-ux/118-localized-changelog-content-and-chunks.json`。

### 2026-07-16 Appearance 六类预览国际化与真实缩放回归（证据 119）

- **UX-I18N-001 RED→GREEN**：Chat、Devices、File Lists、File Preview、Session List、Lists & Settings六类缩放预览仍硬编码简中，Settings预览还固定显示“简体中文”。七个目标GitNexus影响均为LOW；新增边界先 **4/4 failed**，随后增加23个typed `previewSamples`键并在default+10 locale提供真实翻译，状态chip改为由调用者传入locale标签。技术路径、代码、JSON、host和branch按用户数据保持语言中立，未改变Amber Crystal布局或缩放模型。最终 **3 files/9 tests**、typecheck和diff check均exit0，生产含Han范围 **9→3**。
- **authenticated Web与性能门禁**：`prime-lagoon`应用43个migration，英语与简中均逐页核验六类预览；Chat消息内容由XL 14px切换到XS 8px，语言重启按既定memory-only策略返回简中登录页，再认证后所有预览正确翻译，浏览器错误为空。App全量 **215 files/1284 tests/0 failed/0 pending**；production export **3918 modules/60 bundles/35 assets/101 files/11,382,820 bytes**，bootstrap raw **6,342,988** / gzip **1,539,834 bytes**，预算余 **12,058 bytes**，较证据118再低3 bytes。截图经人工复核，浏览器、私有daemon和环境已清理，production daemon PID639022、两个runner及三条8443连接不变。下一高风险批次处理`sessionUtils.ts`可达thinking文案；Native、十locale视觉、分享和全页面无障碍仍开放。完整证据见`docs/audits/evidence/2026-07-16-ux/119-localized-appearance-previews.json`。

### 2026-07-16 会话 thinking 文案国际化与 active-turn 终态保护（证据 120）

- **CRITICAL影响下的最小投影修复**：GitNexus确认`useSessionStatus`影响4个直接调用者、13个符号、3组会话流程和5个模块。旧实现仍以`getCurrentLanguage().startsWith('zh')`二分中文12条/英文7条；新边界先 **4/4 failed**。实现仅把七条`statusText`迁入typed `sessionThinking` default+10 locale，不改presence、permission、thinking布尔、5200ms节奏、状态枚举、active turn、turn-end或archive所有权。Hook回归锁定离线→权限→thinking→waiting优先级和5.2秒轮换；最终定向 **6 files/18 tests**、typecheck和diff check均exit0。生产可达含Han文案清零，范围 **3→2** 只剩dev action-menu夹具与`toSnakeCase`文档示例。
- **真实Codex与终态证据**：`prime-cloud`应用43个migration并运行隔离Codex runner。英语active turn显示`Reviewing context…`/`Checking changes…`；切换zh-Hans按memory-only策略退出认证，再以一次性URL认证后显示`正在准备下一步…`/`正在检查变更…`，页面错误为空。清理未直接发signal，而由私有daemon `stop-session`返回stopping；runner PID2335902及app-server退出，daemon list清空，Server查询为`active=false/thinking=false`。浏览器、私有daemon和环境已删除，production PID639022、两个runner及三条8443连接保持。
- **统一回归与预算**：App全量 **217 files/573 suites/1290 tests/0 failed/0 pending**；production export **3918 modules/60 bundles/35 assets/101 files/11,386,030 bytes**，bootstrap raw **6,342,769** / gzip **1,539,641 bytes**，预算余 **12,251 bytes**，较证据119下降193 bytes。截图、哈希、RED/GREEN、Runner日志与清理数据见`docs/audits/evidence/2026-07-16-ux/120-session-thinking-copy-i18n-and-lifecycle.json`。其余8 locale Changelog正文、Native、十locale视觉、分享与全页面无障碍仍开放。

### 2026-07-16 Evidence 121：项目与 Git 真实弹层无障碍闭环

- **触发条件与源码证据**：authenticated Web 的 Project Details 缺少named dialog与named close；Project Edit取消目标仅34px，约120个图标在真实可访问树中均为无名generic；Git提交详情关闭目标32px，`Hash/Parents/Refs`为硬编码且提交行无按钮名称。受影响源码为`ProjectDetailsSheet.tsx`、`ProjectEditSheet.tsx`、`ProjectIconPicker.tsx`和`git-log.tsx`；GitNexus预改影响均为LOW，直接调用者各1，最大影响符号5。
- **修复与真实验证**：三个surface均获得named modal/backdrop/close语义和不小于44px目标；Git metadata及commit row动态名称进入default+10 locale；每个48px项目图标获得本地化button名称、原生selected和Web `aria-pressed`。真实隔离Codex runner读取当前仓库Git图，在英语/简中及1280/390宽度验证焦点留在dialog、Escape关闭、无横向溢出、0 page error。真实DOM还发现`accessibilityState.selected`不会映射普通Web按钮，故追加`aria-pressed`并再次观察到选中图标。
- **回归与预算**：RED **1 file/4 failed**，GREEN定向 **4 files/12 tests**；App全量 **218 files/1295 tests/0 failed/0 pending**、typecheck和diff check exit0。production export **3918 modules/60 bundles/35 assets/101 files/11,389,451 bytes**，bootstrap raw **6,343,705** / gzip **1,539,839 bytes**，预算余 **12,053 bytes**。runner通过`stop-session`优雅退出，隔离浏览器/server/Web/daemon均删除，production daemon PID639022及两个既有runner/8443连接保持一致。完整命令、DOM、截图SHA-256和清理记录见`docs/audits/evidence/2026-07-16-ux/121-project-and-git-modal-accessibility.json`。
- **剩余风险**：Native VoiceOver/TalkBack、完整axe、十locale视觉与真实chunk失败重试仍开放；Git历史中的中文提交主题属于用户仓库数据，不是应用硬编码文案。bootstrap只余12,053 bytes，后续仍必须执行预算门禁。

### 2026-07-16 Evidence 122：明确选择内容的本地 Share Sheet

- **触发条件与边界**：UX-SHARE-001基线没有正式Share API。第一层按产品约束只能分享用户明确选择的本地内容，不能暗含会话、账户、服务器、token、secret、URL或key。选择现有“长按消息块→Text Selection”作为入口，不新增信息架构；GitNexus对`TextSelectionScreen`判定LOW（0 direct/0 process）。
- **TDD与实现**：RED为纯分享模块缺失和UI/locale两项boundary失败。GREEN新增可注入OS adapter的纯状态机：空内容不启动，原生dismiss与Web AbortError安静返回，unsupported/失败继续抛给UI；header以两个同权44×44图标提供Copy/Share，具名button和disabled state。四条反馈进入default+10 locale。定向 **3 files/7 tests**、typecheck/diff check exit0。
- **真实验证**：authenticated-empty `vivid-pearl`以真实MMKV临时文本进入`/text-selection`，英语与简中、1280与390px下拦截Web Share API，payload严格等于所选文本和本地化title且无URL；provider拒绝时显示本地化失败modal。双按钮均44×44，无横向溢出，page errors=0。截图人工复核曾发现简中首次截屏早于图标字体呈现，等待字体后重新取证并覆盖旧截图。浏览器和隔离server/Web/daemon已删除，production daemon PID639022、两个runner及三条8443连接不变。证据见`docs/audits/evidence/2026-07-16-ux/122-local-content-share-sheet.json`。
- **未关闭内容**：本批只完成本地Share Sheet。HTTPS Universal/App Links不能在缺少权威production domain、Apple Team ID和Android签名证书指纹时生成伪association配置；Native OS Share Sheet仍需真机证据。外部E2EE capability继续禁止，直到撤销、TTL、scope、服务端ciphertext-only及fragment key威胁模型和协议测试完成。按批次策略未重复App full/export，Phase 3聚合门禁再执行。

### 2026-07-16 Evidence 123：App Links 旧委托清除与 HTTPS 路由 fail-closed

- **新增P1触发条件**：`public/.well-known/assetlinks.json`仍把全部URL委托给旧`com.slopus.agenthub`及旧证书指纹；Apple association同样把`*`委托给`466DQWDR8C.com.ex3ndr.happy`。AgentHub自身`associatedDomains`/`intentFilters`为空，旧文件不会服务当前App，只会让无关上游App在部署该Web产物的域名上获得关联资格。
- **TDD与修复**：association policy RED **2 failed/1 passed**，随后将Android声明改为`[]`、Apple details/apps改为空数组并锁定不得出现旧品牌ID。认证HTTPS session URL模块先缺失RED，再以exact origin、单个8–128位opaque ID、无userinfo/query/fragment及路径逃逸的纯builder/parser闭合；目标`/session/:id`仍由auth guard判定非公开。合并GREEN **3 files/11 tests**、typecheck/diff check exit0。
- **公网事实与发布判定**：`openssl`/`curl`确认`agenthub.yzsd.asia:443`证书为`gs.1001xr.com`且SAN不覆盖目标；8443证书覆盖`*.yzsd.asia`，根路径200，但两个`.well-known`均返回JSON 404。Universal/App Links要求标准HTTPS关联抓取，因此当前production Native handling和UI必须保持关闭。启用前必须确定可用443 Web origin、Apple Team ID、Android production signer SHA-256，并在同origin提供scoped association与正确content-type/no redirect。命令和响应见`docs/audits/evidence/2026-07-16-ux/123-app-links-fail-closed-and-https-route-boundary.json`。

### 2026-07-16 Evidence 124：首页唯一主操作、右侧工作台与真实断线恢复

- **触发条件与影响范围**：桌面侧栏同时暴露顶部“+”、底部宽FAB和空态中央按钮，最多三个“Start New Session”；平板/桌面索引主区域则由`MainView`明确返回空白View。`SidebarView`、`MainView`、`EmptySessionsTablet`与`SessionsListWrapper`的GitNexus upstream impact均为LOW，最多2个直接影响和2条流程，因此修复限定在展示投影与导航入口，不改同步、RPC、会话创建或生命周期。
- **RED→GREEN与设计决策**：模型和右侧组件缺失时 **2 suites/3 tests failed**。GREEN移除桌面侧栏三处重复入口，由右侧唯一主CTA承担新会话；右侧以既有Amber Crystal建立设备健康、最近工作和恢复信息层级，手机仍是远程控制台而非桌面IDE。纯模型覆盖loading/connecting/offline/empty/no-online/ready，只有connected且存在在线设备才允许创建。首页状态使用named `role=status`+polite live region，所有动作至少44px；26个`homeOverview`键进入default+10 locale。最终 **3 files/7 tests**、App typecheck和diff check均exit0。
- **真实 authenticated Web**：`gentle-oasis`在英语/简中1280×900与简中390×844验证桌面仅一个主CTA、手机仅一个header入口、`html.lang=zh-Hans`、无横向溢出和0 page error；桌面CTA真实导航到`/new`。停止隔离Server进程组后约3秒进入“连接已中断”、设备`0/1`、CTA 44px且`aria-disabled=true`，恢复Server后自动回到“工作台已就绪”、`1/1`并重新启用。四张截图人工复核后固化SHA-256；浏览器、Server/Web、私有daemon和环境均删除，production systemd daemon PID639022、runner2072452/1687829与三条8443连接不变。完整证据见`docs/audits/evidence/2026-07-16-ux/124-home-overview-cta-and-resilience.json`。
- **边界**：本批关闭首页重复CTA、空白右侧区和首页真实断线恢复子风险；authenticated-empty没有真实会话，因此最近工作填充态不冒充完成。完整axe/全页面键盘、320px、Native VoiceOver/TalkBack、其余locale视觉与外部分享仍保持Open。按批次策略未重复App full/export，当前完整基线继续引用证据121的 **218 files/1295 tests**，Phase 3聚合门禁必须再统一执行。

### 2026-07-16 Evidence 125：首页填充态、axe/键盘/320与隐藏Drawer焦点

- **触发条件与根因**：真实填充首页暴露嵌套session/Quick Actions交互、缺失名称、低于44点目标及亮色对比问题；320真实Tab还进入关闭的`Close drawer`。根因是`react-native-drawer-layout@4.2.2` Web Overlay只给父节点`aria-hidden`和`pointer-events:none`，内部Pressable仍为`tabindex=0`。`SidebarNavigator` GitNexus upstream impact为LOW，仅`RootLayout`一个直接调用者、1条入口流程。
- **RED→GREEN**：首页语义/尺寸边界分别产生多轮1–2项失败；依赖补丁契约在实现缺失时 **2/2 failed**。GREEN拆除嵌套button，统一名称/44点/TabBar/header/status/亮色对比，并增加只覆盖Web源码与ESM输出的动态`tabIndex=open?0:-1`补丁。补丁安装时幂等、依赖形状漂移时fail-closed，契约纳入required dependency boundary；最终补丁2/2、App **4 files/16 tests**、Docker策略10/10、dependency boundary 4/4、App typecheck和diff check均exit0。
- **真实 authenticated Web**：`snug-dune` 43 migrations，真实Codex会话出现在Recent work，Enter导航到对应session。1280 axe **0 violations/19 passes**；320 axe **0 violations/22 passes**、14个可见控件均至少44点、无横向溢出。修复后关闭Drawer为`tabIndex=-1`，Tab从Settings进入document body再回Sync，不再触达`aria-hidden`后代；page errors=0。axe仅将非BMP Ionicons对比列为人工复核的incomplete，未作为违规掩盖。截图、哈希和完整时间线见`docs/audits/evidence/2026-07-16-ux/125-home-recent-work-axe-keyboard-320.json`。
- **清理与边界**：浏览器、真实私有session、Server/Web、daemon及`snug-dune`均优雅停止并删除，无孤儿；production systemd daemon PID639022、runner2072452/1687829和三条8443 ESTAB保持。本批关闭首页填充/axe/键盘/320子矩阵，不能外推其余页面、Native VoiceOver/TalkBack或其余locale；App完整回归仍引用证据121的 **218 files/1295 tests**，Phase 3聚合回归未执行。

### 2026-07-16 Evidence 126：Devices、Settings、New Session 双断点无障碍矩阵

- **真实发现与影响范围**：authenticated Web最初暴露Settings装饰banner的`image-alt` critical、New Session多个19–42px操作目标、picker radio缺`aria-checked` critical，以及桌面sidebar/三页缺main landmark或稳定H1。`SettingsHeader`、`NewSessionSetupCard`、`PickerContent`、`DefaultBackButton`、`SidebarView`、`MainView`、`MachinesView`、`SettingsView`的GitNexus upstream impact均为LOW，无HIGH/CRITICAL警告。
- **实现与定向验证**：Settings图片统一为空alt且从Native辅助树隐藏；New Session返回、折叠、配置chip、advanced、搜索、composer/send提升到物理44点，picker为具名radio+显式checked；共享Header/Sidebar及三页根补banner/navigation/main/H1语义，辅助标题不改变视觉。边界测试由最初 **2 failed/0 passed** 转为定向 **3 files/13 tests passed**，App typecheck退出码0。
- **真实页面结果**：Devices、Settings、New Session在1280×900和320×844六个断点全部 **axe 0 violations、低于44目标0、横向溢出0**；picker为`aria-checked=true`，New Session真实Tab前序依次到Back、上下文、Device、Working folder和agent/model/effort且无`aria-hidden`焦点。截图人工检查确认Amber Crystal布局无偏移；完整axe计数、截图哈希与刷新后memory-only重新登录边界见`docs/audits/evidence/2026-07-16-ux/126-core-pages-axe-keyboard-320.json`。
- **清理与边界**：`plush-ocean`的浏览器、Server/Web和私有daemon均down/remove且目录消失；production systemd daemon PID639022、runner2072452/1687829和三条8443 ESTAB保持。本批仅关闭三页核心状态，不外推loading/error/offline/empty、其他路由、Native VoiceOver/TalkBack、locale与分享；App完整回归仍引用 **218 files/1295 tests**，Phase 3聚合回归后置统一执行。

### 2026-07-16 Evidence 127：Settings 高频子页与共享控件边界

- **真实RED与影响范围**：Appearance存在3个、Features存在6个critical匿名Switch，全部实际40×20；三个主题选项70×28；Credential edit三个基础输入26px，展开后五个模型输入同类；Account/Appearance/Features/Credentials/Add正文缺稳定main/H1。截图又发现320 Current Language标题被detail挤碎、Credentials两条路由只有返回箭头没有可见标题。共享`Switch` GitNexus upstream为HIGH（4 direct/3 flows），`SegmentedControl`和各页为LOW；HIGH已在修改前明确告警并扩大所有直接调用者验证。
- **架构与实现**：新增`SettingsPage`作为main/H1/ItemList唯一页面边界并迁移五页；`Switch`把`accessibilityLabel`提升为类型必填且统一44×44，全部生产/dev调用补名；`SegmentedControl`改为named radiogroup、radio/checked与44点，主题标签改用已有locale键。Credential八个可见输入具名且44点，Credential list/add/edit route header本地化注册，edit动态覆盖标题；Current Language值移入整行subtitle。
- **验证结果**：边界首轮 **4/4 failed**，语言重排再RED **1/5**，route header再RED **1/6**；最终定向 **4 files/18 tests**、App typecheck exit0。Account、Appearance、Features、Credentials empty、Add Credential十个1280/320状态全部axe 0 violations、0小于44目标、0横向溢出；Experimental Features用物理Space从false→true并恢复false。十张截图人工检查，初始标题破碎和header缺失均在重拍中消失。完整计数、SHA-256与命令见`docs/audits/evidence/2026-07-16-ux/127-settings-subpages-axe-keyboard-320.json`。
- **清理与边界**：`fair-garden`浏览器、Server/Web、私有daemon已down/remove且无残留；production daemon PID639022、runner2072452/1687829和三条8443 ESTAB保持。该批关闭核心空态/创建态，不外推凭据非空/edit/delete/error、Server失败、其余settings scale/language/usage、Native和locale矩阵；App完整回归仍引用218 files/1295 tests，Phase 3聚合回归未提前重复。

### 2026-07-16 Evidence 128：Language、Usage 与六类 Scale 深层设置页

- **真实RED与影响范围**：Language、Usage及六个Scale页活动正文均缺main/H1；Language和Scale选择只是button/generic，Usage周期和Agent选择无radio/checked，桌面高度仅34px，empty状态无live status。ScaleSlider共享影响为CRITICAL（6直接调用者/6流程），StatusChip为HIGH（5直接/13符号/4流程），其余目标LOW；两个共享风险均在编辑前告警并覆盖全部直接页面。真实axe进一步捕获Usage 7个、Session Preview 9–10个、Chat 2个、File Preview 19个、File Lists 1个浅色低对比节点。
- **实现与键盘根因修复**：新增`SelectRow`与`ScaleSettingsPage`，六页去重且保留Device `itemScale`；Language/Usage接入共享SettingsPage及本地化route header；所有选择输出named radiogroup、radio/checked与44px，Usage状态为polite live region并用当前语言格式化日期。真实聚焦后发现RN Web radio为`DIV tabindex=0`，Enter有效但Space失效；新增无平台依赖纯核心和Web适配层，接入Language、Scale、Usage、SegmentedControl及New Session Picker，Space阻止页面滚动且只激活一次。共享StatusChip及light syntax/git/line-number颜色增加WCAG AA契约，保持Amber Crystal点/背景语义通道。
- **验证结果与边界**：Language、Usage empty、Session/Chat/File/File Lists/Devices/Lists & Settings共8页×1280/320=16状态均为axe 0、0小目标、0横向溢出、main/H1和checked有效、page errors 0。真实Space验证Usage Today→7 days、Adaptive→Light→Adaptive、Scale Default→M→Default、Language English→restart modal→Cancel。RED深页4/4、Status颜色1/4、主题对比1/7均如实失败；最终定向 **10 files/44 tests**、typecheck、diff check exit0。六图人工复核与SHA-256见`docs/audits/evidence/2026-07-16-ux/128-settings-deep-pages-axe-keyboard-320.json`。`true-cedar`及浏览器已清理；production daemon PID639022、runner2072452/1687829和三条8443 ESTAB不变。Usage populated/error/loading、Native辅助技术、全locale视觉与Phase 3聚合回归继续Open。

### 2026-07-16 Evidence 129：Usage/Credentials 运行状态与账号级用量幂等

- **真实RED与服务端根因**：Usage与Credentials此前没有完整可恢复的loading/error/retry边界，凭据删除/保存失败也不能明确保证已有数据和未保存输入继续存在；App边界先3/3失败。真实Socket进一步证明账号级usage-report在`sessionId=null`时无法使用Prisma nullable compound unique input完成upsert，Server Handler/Schema边界3/3失败。修复没有伪造session，而是增加非空`scopeKey=account|session:<id>`、回填旧行并替换唯一索引；已有隔离数据库保留凭据原位升级后，真实Socket写入Claude/Codex两份报告，查询200、1 bucket、2 reports、30,540 tokens。
- **客户端运行状态与视觉边界**：Usage和Credentials list/edit/create/delete均使用显式loading/ready/error、AbortSignal与Retry；加载或删除失败保留旧数据，保存失败保留表单，删除按钮具名且至少44px。Usage日期使用当前locale，浅色图表文字对比与40px列目标修正；六条错误/占位文案进入typed default+10 locale。authenticated Web真实执行Usage SIGSTOP loading→恢复、route abort error→Retry→恢复、Credentials加载/编辑/删除失败→保留→Retry→成功删除、无效ID与保存失败→原表单恢复。五个axe审计状态在1280/320均合计0 violations、0小目标、0横向溢出，page errors为0。
- **验证、清理与新风险**：App定向 **8 files/30 tests**，Server全量 **36 files/137 tests**（另2项外部integration skipped），两端typecheck、Prisma validate及diff check均exit0；六张截图和SHA-256见`docs/audits/evidence/2026-07-16-ux/129-settings-operational-states.json`。测试凭据通过真实UI删除，`deft-beacon`和浏览器无残留，production systemd daemon PID639022、runner2072452/1687829及三条8443连接不变。SIGINT清理同时真实捕获`session-timeout`在Prisma engine开始关闭后仍查询一次并记录`Response from the Engine was empty`，新登记SRV-REL-010为Open；不得以过滤警告代替后台循环取消和有序关闭。Native辅助技术、全locale视觉及Phase 3聚合回归继续开放。

### 2026-07-16 Evidence 130：Server 有序关闭与后台循环取消

- **双层RED定位**：证据129真实SIGINT先捕获Prisma engine关闭后`session-timeout`仍查询；确定性SIGTERM测试进一步得到`background:start → database:disconnect → background:stopped`，1/1失败。第一版只分阶段后，真实Server仍在20秒内无法退出；没有用超时强杀伪造通过，而是继续追到`startTimeout`同时被`forever()`包裹且内部还有`while(true)`，Abort只让delay返回，内层循环马上继续查库。
- **最小可靠性修复**：`awaitShutdown`仅调整执行次序为API/Socket入口、`keepAlive:*`后台任务、数据库/缓存/Redis资源三阶段，同阶段保持并发和错误可观察；GitNexus为LOW的`startTimeout`去掉重复无限循环，每次callback只做一次Session/Machine sweep及一次abortable delay。CRITICAL的`onShutdown`与HIGH的`keepAlive`注册/等待语义未修改，避免扩大API/Socket与监控影响面。
- **验证与清理**：SIGTERM单测1/1、单次sweep契约1/1、定向3 files/8 tests、Server全量 **38 files/139 tests**（另2项外部integration skipped）、typecheck和diff check均exit0。44 migrations的`plush-canyon`真实Server收到SIGINT后在1ms完成2个ingress、0ms完成2个background、1ms完成2个resource handler，正常退出且engine warning/handler error均为0。环境与44983监听已删除；后端进程治理按规则无需截图。完整命令、计数和两轮RED见`docs/audits/evidence/2026-07-16-server/130-ordered-server-shutdown.json`。

### 2026-07-16 Evidence 131：外部 Runner 终态收敛与 Provider 矩阵复核

- **真实RED与根因**：当前源码8场景authenticated矩阵首次为 **5 passed/1 failed/24 skipped**；Claude idle wrapper在SIGTERM超时并收到SIGKILL后仍未触发Server archive。根因是daemon只用`kill(pid, 0)`判断存在性，Linux僵尸态仍返回成功；单独加入`/proc`识别后用例18.299秒通过，但连续矩阵再次暴露5秒轮询窗仍受外部父进程reap时序影响。`monitorExternalSessionExit`、`onChildExited`和`stopSession`的GitNexus影响均为LOW。
- **最小修复**：新增可测试的Linux进程状态探针，正确解析带`)`的comm字段，将`Z/X`、`ESRCH`和缺失proc视为退出，权限/读取/格式异常保守视为存活；SIGTERM仍轮询真实状态。SIGTERM已确认超时且SIGKILL成功后直接执行幂等终态收敛，不再等待无关父进程在5秒内reap zombie；`timeout`生命周期、archive fallback与正常child exit语义不变。
- **验证与边界**：单元 **3 files/8 tests**、CLI typecheck、diff check均exit0；最终`vivid-meadow`真实矩阵 **1 file/6 passed/24 skipped，exit0，146.99s**，Codex/Claude/OpenCode的fatal+idle六场景严格校验0错误。全8场景verifier仍按设计exit1，只报告本机缺少Gemini CLI/凭据导致的两个skip，未将其冒充通过。隔离环境/进程已清理，production单一systemd daemon PID177021重新收养runner2072452/1687829并保持三条8443连接。证据`docs/audits/evidence/2026-07-16-lifecycle/131-external-runner-terminal-convergence.json`；Gemini有效环境、OpenClaw live、macOS/Windows和protected GitLab继续Open。

### 2026-07-16 Evidence 132：十语言核心页面视觉、语义与窄屏重排

- **真实RED与语言口径**：10个用户可选语言为`en/ru/pl/es/it/pt/ca/zh-Hans/zh-Hant/ja`；`_default`是类型/fallback树，不是第11种UI语言。首次50状态矩阵发现Sessions在所有语言缺main/H1，七个语言包的New Session设置卡仍是英文占位，Settings/Language/Account长文案被单行截断，高级配置pill在320px横向隐藏。边界测试 **4 files / 6 failed / 12 passed**；副标题修复后又以 **2 failed / 7 passed** 锁定长标题与凭据pill残余问题。
- **兼容实现**：共享`Item`影响为CRITICAL、`ItemProps`为HIGH，因此新增的`titleLines`保持未传调用者原有`subtitle ? 1 : 2`行为，仅审计页面选择多行；Account通知状态移到副标题首行，避免320px右侧状态压碎标题。Settings/Account/Language允许长文案自然换行；New Session说明最多两行，高级pill在Amber Crystal卡片内换行；ru/pl/es/it/pt/ca/ja补齐完整设置卡译文；Sessions loading/empty/populated三态补main与本地化一级标题。
- **真实GREEN与边界**：最终定向 **4 files/18 tests**、App typecheck、目标diff check均exit0。10语言×5路由×320共50状态及Account/New Session 10语言×1280共20状态全部满足lang/main/H1、横向溢出、视口外文本、可见截断、小于44目标为0；最终Account改动再跑10语言增量也全0。俄语Settings/Account/New Session与日语New Session截图人工复核；5个WCAG A/AA axe代表状态0 violations，但透明Amber Crystal合成面仍有51个`color-contrast` incomplete，未冒充自动通过。`sharp-beacon`、浏览器和私有daemon均清理，production daemon PID177021、runner2072452/1687829和三条8443连接不变。完整证据见`docs/audits/evidence/2026-07-16-ux/132-full-locale-core-pages.json`；其他路由/状态、Native VoiceOver/TalkBack、透明层人工/像素对比和Phase 3聚合回归继续Open。

### 2026-07-16 Evidence 133：十语言静态路由、窄屏布局与语义边界

- **100状态真实基线**：在`lucid-grove` authenticated-empty环境，以10个用户可选语言覆盖Artifacts、New Artifact、Changelog、New Path、Server、Appearance、Features、Credentials、Usage、Transfers共100个320×844状态。五个未改路由原始50状态已全绿；五个问题路由分别暴露Appearance 71个、Features 83个、Server 8个可见截断节点，New Path 6个视口外节点/20个小目标，以及Transfers 30个视口外节点/10个截断节点/60个小目标。首轮边界测试为 **3 files / 4 failed / 15 passed**，所有目标的GitNexus upstream风险均为LOW。
- **人工复核驱动的继续RED**：自动几何扫描最初漏掉Appearance六个Scale标题的俄语省略与碎片换行；截图复核后将当前值移到标题下方。axe随后捕获New Path“手动输入路径”使用2.64:1的amber背景色，改为具名44点按钮及`textLink`。桌面矩阵又发现Server/New Path/Transfers缺main、Server URL输入仅42px；最终移动矩阵再捕获葡语Transfers“Em andamento”被三列网格裁切。每项均先补失败契约，再以窄屏两列/桌面三列等最小展示修复收口，未改变路由、Server切换、路径选择或传输业务逻辑。
- **最终验证与边界**：当前实现的五个受影响路由完成10语言×320的50状态闭环，五路由×10语言×1280另50状态；与未改五路由的50个初始绿状态合并后，十路由移动100状态的lang/main/H1、横向溢出、视口外文本、可见截断、小于44目标均为0。俄语五页截图人工复核；五页WCAG A/AA axe为0 violations，25个透明合成面`color-contrast` incomplete保持显式残余风险。最终定向 **3 files/20 tests**、App typecheck和目标diff check均exit0。`e133`与`lucid-grove`已关闭删除；production daemon PID177021、runner2072452/1687829及三条8443连接不变。完整RED/GREEN、矩阵、截图SHA-256见`docs/audits/evidence/2026-07-16-ux/133-static-routes-full-locale.json`；动态Machine/Session/File/Message、非空Artifacts/Transfers、Native辅助技术、透明层像素对比和Phase 3聚合回归继续Open。

### 2026-07-16 Evidence 134：Artifact CRUD、共享弹窗与按钮对比度

- **真实基线与RED**：`prime-aurora` authenticated Web真实创建Artifact并执行详情、编辑、保存和删除确认。详情编辑/删除为无名38×40 generic clickable，新建/编辑Save为generic clickable，输入仅依赖placeholder；桌面缺main，outer dialog虽有`role=dialog/aria-modal=true`却无名称，Cancel/Delete为40px。首轮边界 **1 file/5 failed**；axe进一步对浅色玻璃上的amber Cancel报告1个serious `color-contrast`。Artifact三个路由与`WebAlertModal`为LOW；共享`BaseModal`、`GlassButton`、`getGlassButtonColors`为HIGH，因此共享改动严格限制为可选名称透传、44点和contrast-safe正文色。
- **最小实现**：三路由及loading/error/not-found分支补active main和H1；Save/edit/delete和两个字段补本地化名称、disabled/busy与44点；Untitled/No content/delete error进入typed default+10 locale，日期使用当前BCP-47 locale。详情初始loading由truthiness改为`body === undefined`并在artifact缺失时收敛错误，修复空正文/无效ID永久loading。Alert/Prompt用标题命名outer Modal并本地化默认动作；GlassButton最小高度44，secondary文字改用主题正文色，不改primary/danger、动画或业务行为。
- **真实GREEN与边界**：真实标题保存为`Evidence 134 Artifact Verified`，日语确认删除后Artifacts列表不再包含它；无效ID显示日语错误而非永久loading。10语言×详情/编辑共20个320×844状态全部`lang/main/H1`正确、横向溢出0、小目标0、字段名随locale变化。英语详情桌面/移动、编辑、删除弹窗及日语编辑/新建共6个WCAG A/AA axe状态0 violations；透明合成面的17个contrast incomplete显式保留。最终定向 **5 files/16 tests**、App typecheck、diff check均exit0。完整命令、截图前后哈希和清理见`docs/audits/evidence/2026-07-16-ux/134-artifact-crud-accessibility.json`；Native、注入式网络失败、透明层像素对比、外部分享和Phase 3聚合回归继续Open。

### 2026-07-16 Evidence 135：Artifact 网络失败、恢复与合法空内容

- **真实RED与根因**：在`stout-reef` authenticated Web中对精确Artifact REST路由注入abort。详情在6次有界传输重试终止后仍把原始有效正文投影为`No content`；编辑页则渲染空标题、空正文且Save可用，存在用失败投影覆盖有效密文的风险。边界测试 **1 file / 3 failed / 1 passed**。根因为`Sync.fetchArtifactWithBody`吞掉认证、HTTP、网络和解密错误并返回`null`，两个页面又将`null`当作可用空数据且effect依赖整个可变Artifact对象。GitNexus upstream影响：同步方法LOW（2 direct callers、2 processes），详情/编辑页面LOW。
- **最小实现**：同步方法仅在完整解密成功后返回Artifact并更新data-key map，所有失败显式传播。详情页增加稳定`loadAttempt`、Error+Retry并仅在合法空正文时显示`No content`；编辑页加载失败时不渲染输入和Save，成功恢复后以独立baseline判定变更，避免列表投影变更误启用保存。未改变E2EE格式、Artifact CRUD接口、路由或Amber Crystal视觉体系。
- **真实GREEN与边界**：读取失败终态在2秒与5秒都稳定为6次传输尝试，无页面级无限循环；移除故障并点击Retry后原始正文恢复。创建/更新失败保留用户输入，删除失败保留记录，解除故障后均可成功重试。标题为空和正文为空两种合法状态分别显示`Untitled artifact`与`No content`。最终定向 **6 files/27 tests**、App typecheck、diff check exit0；详情/编辑失败态均有main/H1、44px Retry、0横向溢出、axe 0 violations，透明合成面分别保留3/2个contrast incomplete。四个临时Artifact已删除。完整命令、RED/GREEN截图哈希和环境清理见`docs/audits/evidence/2026-07-16-ux/135-artifact-failure-recovery.json`；Native同矩阵、透明层像素对比、外部分享和Phase 3聚合回归继续Open。

### 2026-07-16 Evidence 136：Transfers 非空、失败、详情与删除操作状态

- **RED与真实发现**：初始边界 **1 file / 3 failed / 1 passed**，证明CustomModal无法命名外层dialog、两个传输自定义弹窗未提供名称、failed错误使用Resume语义；纳入42px详情动作后为4 failed/1 passed。`bold-frost`真实authenticated Web以五条仅浏览器本地MMKV任务覆盖paused/cancelled/completed/failed，继续发现详情ScrollView触发1个serious `scrollable-region-focusable`、可见Transfers main没有自身H1（旧扫描误计0×0后台Terminals标题），以及具名checkbox聚焦后Space仍保持false。所有目标GitNexus upstream均为LOW。
- **最小实现**：CustomModalConfig增加可选`accessibilityLabel`并由两个BaseModal分支透传；详情/删除调用传入本地化标题。failed行独立使用refresh+`common.retry`，paused保留Resume；详情动作改为44px，ScrollView改为具名可聚焦region；Transfers可见main补仅辅助技术可见的本地化H1；删除本地文件checkbox复用共享Space适配。未改变传输协议、续传算法、文件删除默认值、E2EE或Amber Crystal布局。
- **GREEN与边界**：最终定向 **6 files/44 tests**、App typecheck、diff check exit0。桌面populated列表、failed详情、completed删除弹窗及320×844 Failed筛选均0 axe violations、0小目标、0横向溢出；ScrollView violation与`aria-prohibited-attr` incomplete均清零，checkbox Space按false→true→false且保留焦点，Cancel后completed记录仍存在。仅剩透明合成面contrast incomplete 18/34/18/7，未冒充自动通过。完整命令、截图SHA-256和清理见`docs/audits/evidence/2026-07-16-ux/136-transfer-operational-states.json`；Native真实下载/打开/目录/删除、网络代理、透明层像素对比和Phase 3聚合回归继续Open。

### 2026-07-16 Evidence 137：动态 Machine、文件与 Message 运行状态

- **RED与真实发现**：Git状态分类模块缺失，动态路由边界首轮6项失败。`quiet-grove` authenticated Web继续发现Machine在线/Session等待、文件语法与工具栏浅色对比不足，目录行40px且没有稳定button语义，Source/Preview只有26×30且为generic；默认长行换行进入FlashList后触发1个serious `scrollable-region-focusable`。不存在文件虽已显示安全的Error+Retry，开发浮层仍因`console.error(..., error)`暴露原始ENOENT。DirectoryTreePanel/Node为HIGH，`getGitStatusFiles`与SimpleSyntaxHighlighter为CRITICAL；前者契约保持不变，后者仅增加默认关闭的可选label。
- **最小实现**：Machine详情/文件、Session文件列表/预览与Message loading/missing/populated统一获得可见main与H1；离线、目录错误、文件加载错误和Git transport错误提供持久安全状态及Retry。目录/搜索/关闭/toolbar/tab全部具名、44点并支持Space；virtualized源码区域只在文件查看器选择性获得具名可聚焦region。Git transport失败不再伪装non-repository或渲染stderr，文件catch不再把原始异常送入用户可见开发浮层；success/语法/工具栏/列表标题切换到contrast-safe token。未改变E2EE、RPC契约、文件读取策略、Amber Crystal布局或产品哲学。
- **GREEN与边界**：定向 **11 files/40 tests**、App typecheck、diff check均exit0。真实桌面/320覆盖Machine详情/文件 populated与missing、Session Files populated、README Source、missing file、Message missing/user/agent；最终11个WCAG A/AA axe状态均0 violations、0小目标、0横向溢出，每个状态恰有1个可见main/H1，源码region为`Source/tabIndex=0`，missing file不再出现原始诊断。隔离浏览器/daemon/runner/环境已清理，生产systemd daemon PID177021、runner2072452/1687829及三条8443 ESTAB保持。完整命令、截图哈希与清理见`docs/audits/evidence/2026-07-16-ux/137-dynamic-route-operational-states.json`；Session主工作台紧凑动作、Native辅助技术、动态全locale、透明合成面对比、外部分享与Phase 3聚合回归继续Open。

### 2026-07-16 Evidence 138：Session 主工作台与 Composer 浮层

- **UX-A11Y-001 / UX-FLOW-001 RED**：Session Header、上下文与Composer紧凑动作此前缺少一致的名称、状态和44点边界；真实320页面确认Back为24×26、Send与textarea为42px。附件/斜杠列表缺menu/menuitem，权限/模型/effort选项是generic clickable；附件或斜杠触发器也没有关闭设置，允许多个浮层重叠。
- **二次真实缺口**：为radio增加角色后，axe继续发现 **16个critical `aria-required-attr`**，原因是RN Web没有把`accessibilityState.checked`投影为DOM `aria-checked`。浅色选中标签为`#d99012`叠加`#fffdf8`，仅 **2.59:1**；展开真实324项命令列表还会为每个未知命令/skill探测动态i18n key并输出warning。
- **最小实现**：Header、machine/path、附件、斜杠、设置、abort、compact、Git与send全部使用本地化button语义和至少44×44目标；Web textarea padding增至44px，Native保持原值。附件/斜杠使用named menu/menuitem，设置使用三组named radiogroup与radio+显式`aria-checked`，三个浮层互斥。选中项以Amber border/dot表达状态、正文回到contrast-safe主文本；命令描述改用已知key白名单和本地化generic fallback，不再探测任意key。原生button的浏览器Enter/Space路径保持单一，未叠加重复Space handler。
- **GREEN与边界**：定向 **4 files/14 tests**、App typecheck、diff check均exit0。authenticated `deft-oasis`真实Codex Session在320×844覆盖空工作台、斜杠菜单、附件菜单和设置radio，四个WCAG A/AA axe状态均0 violations、0小目标、0横向溢出；Space完成`false→true→false`且焦点保留，浮层时间序列每次只有一个expanded，动态命令warning与page errors均为0。环境doctor无问题，浏览器、Server/Web、私有daemon/runner已清理；生产systemd daemon PID177021、runner2072452/1687829及三条8443 ESTAB保持。完整证据见`docs/audits/evidence/2026-07-16-ux/138-session-workbench-accessibility.json`。Native辅助技术、动态全locale、透明合成面对比、外部分享与Phase 3聚合回归继续Open。

### 2026-07-16 Evidence 139：外部 E2EE selected-text capability 分享

- **边界与RED**：客户端此前没有外部capability加密/URL边界，Server没有ciphertext-only持久化、TTL、owner撤销和统一public 404。真实独立public浏览器继续捕获动态`[id]`被auth guard重定向、public sodium未ready、POST已经成功但浏览器Share API缺失仍误报创建失败，以及Expo在首次history scrub后恢复初始fragment。production export首轮还以 **1,552,211/1,551,892 gzip bytes** 超预算319 bytes退出1。
- **安全实现**：只对exact selected text使用fresh 32-byte libsodium SecretBox key；Server仅接收ciphertext/scope/TTL，严格create/list/revoke/public-read提供64KiB、1h/24h/7d、50 active quota、幂等create、uniform 404、no-store/no-referrer/noindex和30日清理。HTTPS capability key只在fragment；public route同步清除fragment并只在模块内存短暂持钥，clean URL刷新显示missing-key且不请求密文。Owner页只接收元数据并可撤销；本地Share Sheet仍是独立动作，上传成功后的delivery failure改走Clipboard且不再误报创建失败。
- **真实GREEN与发布边界**：独立unauthenticated public session完成解密、clean URL、刷新0请求和撤销404；authenticated owner页完成list/revoke，public/owner axe均0 violations。App **240 files/1396 tests**、Server **39 files/145 passed/2 external skipped**、两端typecheck、45 migrations、production export均exit0。Owner页Web按需拆为2.9KB chunk后bootstrap gzip **1,551,690/1,551,892，余202 bytes**。`fresh-grove`、两浏览器和TLS代理已清理，production daemon PID177021、runner2072452/1687829及三条8443连接保持。完整命令、截图哈希与无密钥证据见`docs/audits/evidence/2026-07-16-ux/139-external-e2ee-capability-share.json`。Native Share Sheet/前台App Links/VoiceOver/TalkBack、生产443证书和association、透明层像素对比与Phase 3聚合Native回归继续Open。

### 2026-07-16 Evidence 140：Native 外部分享链接生命周期

- **RED与实现**：证据139的Native分支只读取`Linking.getInitialURL`，App已在前台时收到新的Universal/App Link不会更新内存capability，也没有可验证的事件清理。边界测试先1/3失败，独立Native生命周期测试先因模块不存在退出1；首个平台文件实现又被typecheck exit2捕获缺少generic解析入口。最终以`.native.ts`订阅initial URL和foreground `url`事件，卸载先关闭active guard再remove，使迟到Promise不能恢复key；`.web.ts`为空stub，Web继续走同步fragment scrub且不打包Native Linking生命周期。
- **验证与明确边界**：initial+foreground顺序、unsubscribe、卸载后迟到Promise均由可执行测试覆盖；严格HTTPS/origin/UUID/fragment解析和association空配置共同纳入 **6 files/19 tests**，typecheck、diff check、production export和budget均exit0。当前bootstrap gzip **1,551,749/1,551,892，余143 bytes**。`associatedDomains`、`intentFilters`及两份public association继续为空，未用伪Team ID或签名指纹制造假绿。完整证据见`docs/audits/evidence/2026-07-16-ux/140-native-external-share-link-lifecycle.json`。真实Android Share Sheet/App Links/TalkBack、生产443证书/association和Phase 3聚合回归继续Open；本批不重复证据139刚完成的240 files/1396 App全量。

### 2026-07-17 Evidence 141：Amber Crystal 透明合成面对比

- **真实矩阵与RED**：对20个authenticated light-theme路由统一运行WCAG A/AA。首页两条success命令文字为`#12834A`叠`#EEF4F6`，只有4.32:1并形成2个serious violation；Shared Links懒加载瞬间progressbar无名；Artifact placeholder虽然被axe标为`elmPartiallyObscured`，但把`#75828C`与玻璃实际合成背景`#F9FBFC`还原后只有3.80:1。边界先2 files/2 failed，placeholder独立契约再1 failed/8 passed。
- **最小视觉修复与人工判定**：浅色success只收深至`#0F6F3E`，浅色input placeholder只改用既有textSecondary；暗色success/placeholder和Amber selection通道不变。lazy progressbar补本地化loading名称。最终20路由axe 0 violations；Artifact placeholder为7.07:1。Transfers的`bgOverlap/shortTextContent`经祖先背景还原为`#111719`叠`#D99012`、6.85:1，人工PASS且不改色。102个`nonBmp`均来自具名Ionicons私用区字形，未被错误当作正文风险。多图预览一度看似出现黑带，但权威PNG无alpha，y=460/520/600/700/800像素均为`rgb(238,244,246)`，故没有伪造布局修复。
- **验证、预算与清理**：定向 **5 files/31 tests**、App typecheck、diff check、production export和budget均exit0；bootstrap gzip **1,551,767/1,551,892，余125 bytes**。390截图、SHA-256、完整矩阵和手工计算见`docs/audits/evidence/2026-07-17-ux/141-transparent-composite-contrast.json`。四个浏览器会话及45 migrations `prime-forest`环境已清理，production daemon PID177021、runner2072452/1687829和三条8443连接保持。动态填充态全locale、Native辅助技术、过窄bootstrap余量和Phase 3聚合回归继续Open。
### 2026-07-17 Evidence 142：Account Web chunk 与安全刷新语义

`APP-PERF-003`、`APP-ARCH-001`、`UX-A11Y-001`、`UX-FLOW-001`、`SEC-CLIENT-004` 的低频 Account 路由子风险已关闭：原25KB源码实现从Expo route壳迁入独立View，Web使用lazy/Suspense并产出18KB chunk，Native保持静态导出；账户功能、设备认证、截屏保护、根密钥显示/复制和注销流程均未改变。失败契约先证明平台边界缺失，随后定向5文件19测试、App typecheck、production export/预算与diff check全部exit0。bootstrap gzip从1,551,767降至1,548,033 bytes，门禁余量从125提升至3,859 bytes。

authenticated-empty `snug-frost`（45 migrations）在390×844完成两条真实路径：同一内存认证运行时从Settings进入Account，页面无横向溢出、无小于44px控件、无browser error；拦截`AccountSettingsView` bundle后进入同一路由，Suspense暴露role=progressbar且本地化名称为`Loading...`。携带凭据启动后再做整页导航会回到登录页，这是用户已接受的“Web刷新后重新登录、root secret绝不持久化”策略，不是回归。两个浏览器会话、Server/Web/私有daemon均已关闭并删除，生产systemd daemon PID177021、runner 2072452/1687829和三条8443连接保持。完整命令、哈希和截图见`docs/audits/evidence/2026-07-17-ux/142-account-route-chunk.json`。Phase 3仍需Native辅助技术、动态填充态全locale与聚合回归；总体发布门禁仍由Phase 1外部Provider/跨平台证据约束。

### 2026-07-17 Evidence 144：App timeout 跨端真实时序

`CLI-REL-002`、`CLI-REL-007`、`APP-REL-001` 与 `UX-A11Y-001` 的 Linux authenticated Web 子矩阵已关闭。新增夹具不进入产品路由：它通过正式ApiClient创建E2EE会话，再把相同session、machine和加密上下文注册给private daemon并绑定拒绝SIGTERM的child；公开输出只含必要ID/PID，token/key由2/2契约保证不泄露。真实390×844归档操作记录stopping、10.288秒后timeout、1.590秒反馈后导航，并在Archived Sessions中显示终态；中间态均为named polite status。截图预览的黑块被记录为浏览器合成伪影，DOM状态与PNG几何仍为权威证据，未据此破坏Amber Crystal主题。全部测试资源和环境清理，生产systemd不变量保持。完整命令、时间戳、哈希和剩余跨平台/Provider风险见`docs/audits/evidence/2026-07-17-lifecycle/144-app-timeout-ui.json`。

### 2026-07-17 Evidence 145：App cooperative exit 跨端真实时序

`CLI-REL-002`、`CLI-REL-007`、`APP-REL-001` 与 `UX-A11Y-001` 的 Linux authenticated successful-exit子矩阵已关闭。安全夹具在证据144同一正式E2EE/daemon注册路径上增加cooperative/stubborn显式模式，子进程仍由executable+argv启动且无shell插值，公开报告继续丢弃token/key。真实RED证明50ms导航窗口让页面只出现stopping便离开，配套unit为1 failed/7 passed；最小修复仅将成功exited反馈窗口改为1000ms，异常状态1500ms和默认50ms保持。最终真实390×844精确记录stopping、1.112秒后exited、再保留1.090秒后返回归档列表；夹具3/3、App 4 files/40、CLI/App typecheck与diff check均exit0。三次child、浏览器、Server/Web/private daemon和环境全部清理，生产systemd daemon PID177021、两个runner及三条8443连接保持。完整命令、时间戳、截图哈希与剩余跨平台/Provider风险见`docs/audits/evidence/2026-07-17-lifecycle/145-app-exited-ui.json`。

### 2026-07-17 Evidence 146：Phase 3 当前源码 App/Web 聚合回归

在证据140–145的Native link生命周期、透明合成面对比、Account chunk与生命周期状态改动之后执行统一回归，而非继续以定向测试外推阶段结论。当前App **242 files/1401 tests/0 failed/0 pending**、typecheck均exit0；production Web以3938 modules导出103文件/11,509,549 bytes，bootstrap 3 scripts合计6,384,808 raw、**1,548,044 gzip**，低于1,551,892门槛3,848 bytes，敏感build-env marker扫描为0。Metro对`@noble/hashes/crypto.js`未声明exports而回退文件解析的警告被如实保留为依赖兼容待办，不能因导出成功而隐藏。Provider能力复核确认当前主机无Gemini CLI/key及OpenClaw gateway/token/config，未用mock/skip冒充真实矩阵。由此只判定Phase 3当前Linux/Web聚合Passed；Native Share/App Links、TalkBack/VoiceOver、动态全locale、生产association、protected CI与Metro警告仍Open。完整命令、入口哈希和边界见`docs/audits/evidence/2026-07-17-ux/146-phase3-app-web-aggregate-regression.json`。

### 2026-07-17 Evidence 147：`@noble/hashes` Metro exports 边界

证据146的production export虽成功，但Metro绕过`@noble/hashes@1.8.0` exports直接按文件解析`crypto.js`，该依赖由CUID2与React Native libsodium共同引入。GitNexus impact仍返回`Transport closed`，因此风险明确标为UNKNOWN而非伪称LOW；本地文本边界仅涉及postinstall补丁。TDD依次捕获缺模块0/2、真实package.json subpath不可导出、仅修ESM后CJS入口仍旧1/2、首轮真实export仍出现原warning，以及原地写污染pnpm内容寻址store硬链接2/3。最终补丁从已导出的main定位包根，写前同时验证ESM/CJS发布形状，以同目录临时文件+原子rename打断硬链接后，只把包自引用等价替换为相对`./crypto.js`；已补丁树幂等，版本形状变化会fail-closed。补丁专项3/3、required dependency boundary 7/7、production export warning 0、App 242 files/1401 tests、budget 1,548,044 gzip全部通过，三个入口hash与修复前完全一致。该warning已Closed；protected GitLab重新安装与未来上游修复后移除补丁仍Open。完整证据见`docs/audits/evidence/2026-07-17-perf/147-noble-hashes-metro-exports-boundary.json`。

### 2026-07-17 Evidence 148：Hermetic Wire pack 与本地 required CI

首次当前源码`ci:verify`在Wire pack contract以1/2失败，证明所谓offline clean install依赖全局@noble tarball；普通frozen install因postinstall原地写已经污染pnpm硬链接store而无法修复，`fetch --prod`又正确暴露Wire dev工具`shx`缺失。证据147新增硬链接RED后改为原子copy-on-write；随后移走旧node_modules、prune store并以frozen+force重建2405包，postinstall与Wire build成功重放。clean consumer进一步暴露CUID2 semver仍依赖registry metadata，最终将当前锁定CUID2/Noble/Zod各自打为本地tarball，并只在临时消费者用pnpm override覆盖传递解析；Wire发布manifest和产品运行时均未改变。最终pack 2/2，完整`ci:verify`以78项可执行策略测试、0失败、退出码0通过，覆盖dependency/pack/Web budget/typecheck+协议/env/Docker/SBOM/provenance/audit/reachability/license/provider/metadata/supply-chain policy。该结果只关闭本地required CI与hermetic pack，不替代真实GitLab master、实际漏洞扫描/SBOM、registry、签名发布或回滚。生产systemd daemon PID177021、两个runner及三条8443连接保持。完整证据见`docs/audits/evidence/2026-07-17-ci/148-hermetic-wire-pack-and-local-ci-verify.json`。

### 2026-07-17 Evidence 149：当前锁文件零漏洞与隔离 Mermaid 11.16

- **供应链 RED 与修复**：真实`pnpm audit`起点为2292依赖、37 moderate/7 low，官方OSV Scanner v2.4.0起点为23个受影响包/44项漏洞。依赖升级和精确security overrides后，当前锁文件`pnpm audit`为2266依赖且info/low/moderate/high/critical全部0，OSV为0 results/0 vulnerabilities，reachable high/critical为空。CLI未使用的`ai` runtime依赖已移除。required CI新增固定manifest digest的OSV job；reachability不再通过package-script stdout重定向，而由`--output`以同目录临时文件+原子rename写纯0600 JSON，避免pnpm banner污染artifact。
- **SBOM、许可证与诚实边界**：当前CycloneDX含2230组件，SBOM为327,050 bytes、SHA-256 `d43f9bd4825cc41a7da0be03f0b7228246074a889e2ad8fe12db828b63184a49`，hash provenance重算`valid=true`。生产许可证清单1550包，只剩`@anthropic-ai/claude-agent-sdk@0.2.96`带Anthropic专有条款；门禁按设计退出1，不能静默映射成SPDX。因而ENG-SC-001只关闭漏洞/可达性子项，仍受明确产品/法务接受、protected GitLab、密码学签名/attestation、registry发布安装与回滚约束。
- **Mermaid 安全与性能**：11.12.2 Native vendored asset与npm运行图统一升至11.16.0，精确bundle SHA-384为`4ffd25314749a5dd92d591ed462a1f1b786d537c4f0ab1557804355141364c9c25109495e4d5309f7d243f6f27db7f04`。首版动态import把parser/language-server带入common chunk，bootstrap gzip升至1,680,202并超预算128,310，故撤回。最终Web与Native复用本地bundle，Web只在`sandbox="allow-scripts"`的`srcdoc` iframe中执行，具备nonce CSP、`connect-src 'none'`、strict mode、编码输入以及source+token+bounded dimensions消息校验；Native保留受限WebView。Web loader直接fetch Metro `asset.uri`并缓存Promise，RED测试与真实network log共同把重复2 GET降为1 GET。
- **统一验证**：Mermaid定向2 files/10 tests、App typecheck、App全量 **242 files/1404 tests**、production export与完整`ci:verify`均exit0。export为2216 modules、66 files/11,441,914 bytes，bootstrap仅1 script、4,080,835 raw/**976,553 gzip**，低于1,551,892门禁575,339 bytes，敏感build marker为0。authenticated `sharp-garden`真实渲染正常图、语法错误和恶意closing-script输入：3个iframe均满足sandbox/referrer/CSP/strict边界，`globalPwned=false`、page errors=0、无外部Mermaid请求；截图已人工复核。浏览器、Server/Web/private daemon与环境完整清理，生产systemd daemon PID2671285、runner2072452/1687829及daemon+两个runner的8443连接保持。完整结构化证据见`docs/audits/evidence/2026-07-17-security/149-osv-zero-mermaid-11-16-and-current-supply-chain.json`。

### 2026-07-17 Evidence 150：受保护 master 的 keyless Sigstore 签名门禁

- **标准与威胁边界**：依据GitLab官方keyless signing示例、Sigstore blob bundle和Fulcio GitLab OIDC规范，选择短期OIDC身份而非仓库私钥。首轮策略4/5 RED证明没有签名job；第一版实现后再次4/5 RED，准确捕获继承`.required`会让普通MR签名任意分支、验签identity由`${CI_COMMIT_REF_NAME}`决定。最终` supply-chain:sign`仅在`$CI_COMMIT_BRANCH == "master" && $CI_COMMIT_REF_PROTECTED == "true"`运行，certificate identity固定为`${CI_PROJECT_URL}//.gitlab-ci.yml@refs/heads/master`，issuer固定`${CI_SERVER_URL}`，避免非保护分支获得可混淆的项目签名。
- **实现**：job通过`id_tokens.SIGSTORE_ID_TOKEN.aud=sigstore`获取短期身份，无repository private key；从`supply-chain:sbom`下载SBOM/provenance artifact。固定digest的Node 20 Bookworm容器下载cosign v3.1.1，先用官方硬编码SHA-256 `ae1ecd212663f3693ad9edf8b1a183900c9a52d3155ba6e354237f9a0f6463fc`执行`sha256sum -c`，再验证hash provenance。SBOM与provenance分别`sign-blob --bundle`，随后用固定master identity/issuer立刻`verify-blob`；两个Sigstore bundle与原artifact以`when: always`保留30天，任何下载、checksum、OIDC、sign或verify失败都会阻断master。
- **本地与外部证据边界**：策略5/5、固定CI容器download/checksum/cosign version/provenance smoke、完整`ci:verify`均exit0。本机临时0600 cosign key对真实SBOM完成sign/verify，追加一个换行后verify退出1并报告invalid signature，随后测试密钥只保留于待清理`/tmp`，不进入仓库。origin为私有GitLab，remote master仍为基线`5c74ea1e`，匿名API为401且本机无`glab`/OIDC token；因此这里只关闭签名CI契约与密码学路径，不声明已有受保护pipeline或生产bundle。真实master keyless bundle、Claude专有许可证、registry发布安装和回滚仍Open。完整证据见`docs/audits/evidence/2026-07-17-security/150-protected-master-keyless-sigstore-gate.json`。

### 2026-07-17 Evidence 151：CLI 发布包干净安装与跨平台工具原子解压

- **发布包与生命周期RED**：当前1.0.3 tarball最初包含开发机`tools/unpacked`，不仅重复约149MB unpacked内容，还会让macOS/Windows仅因存在同名文件而误用Linux二进制。移除该目录后，真实registry-backed pnpm consumer又证明依赖postinstall没有执行，首次`agenthub --version`后工具仍缺失；并发/错平台专项初始0/2，required CI策略5/6，说明既无原子恢复也无构建→安装→执行门禁。
- **最小实现**：发布白名单只保留12个平台压缩archive与licenses。`agenthub`入口在加载或重启dist之前静默await `unpackTools`，因此不会污染`--version`输出，失败则显式退出1。解压目录必须有匹配当前arch-platform的`.platform`；三个目标必须是普通非symlink文件。0700锁串行化并发调用，独立0700 staging在精确条目校验后通过rename/backup原子替换，任何失败清理临时目录并恢复旧完整目录。`agenthub-mcp`不消费这些工具，保持独立入口。
- **GREEN、体积与运行不变量**：干净consumer真实安装并执行`agenthub --version`、`--help`和`agenthub-mcp`错误边界，组合专项3/3；供应链策略6/6、CLI build、unit **114 files/769 tests**、完整`ci:verify`均exit0。当前包为 **105,318,544 compressed / 112,743,053 unpacked / 58 entries**，不含`tools/unpacked`，unpacked较261,928,991下降56.96%。构建前唯一systemd daemon PID2671285、runner2072452/1687829和三条8443正常；按KillMode=process停止daemon后runner不断线，构建后新daemon PID3110730完整收养原runner，最终仍是三条8443、state0600、NRestarts=0。真实npm发布→升级→回滚、macOS/Windows包执行仍未发生；根拥有只读安装且禁lifecycle的组合记录为受控残余风险，不冒充关闭。完整证据见`docs/audits/evidence/2026-07-17-release/151-cli-pack-install-and-cross-platform-tools.json`。

### 2026-07-17 Evidence 152：只读 CLI 安装与版本化私有工具缓存

- **残余与多轮RED**：证据151仍要求安装目录可写才能在lifecycle被禁时首次解压；直接systemd运行dist也绕过bin。新增契约先以cache 2/3、四消费者17/21失败，随后真实发现cache路径中的symlink会被递归mkdir/chmod跟随并写穿到外部目录（3/4），又发现Configuration私有树加固会在第二次启动把difft/rg改成0600，而有效性检查仍接受（解压4/5、配置3/4）。这些失败均保留并修根因，没有通过放宽私有文件策略或跳过平台测试取得绿灯。
- **实现**：package `tools/archives`继续作为可信只读source；package无当前平台unpacked时，bin与直接dist在命令处理前准备`$AGENTHUB_HOME_DIR/tools/<version>/<arch-platform>/unpacked`。缓存segment受限，逐级lstat拒绝symlink/非目录/越界，archive必须regular non-symlink，unpacked根与三个文件也拒绝symlink。完成原子交换后才设置内部prepared path；difftastic、ripgrep launcher和Claude/Codex/Gemini/ACP/OpenCode/OpenClaw metadata均走统一resolver。Configuration继续把目录收紧0700、普通私有文件0600，只对精确缓存形状下的difft/rg保留0700；若owner-exec丢失则校验失败并从archive原子修复。
- **最终证据与进程治理**：只读registry consumer删除package unpacked并递归只读后，直接`node dist/index.mjs --version`成功准备用户cache；第二次`agenthub --help`后difft/rg仍可执行，`agenthub-mcp`边界不变，组合6/6。消费者4 files/21、权限2 files/5、CLI unit **115 files/773 tests**、typecheck/build和完整`ci:verify`均exit0。一次定向Vitest隐式build的即时复核尚未见重启，但后续权威检查如实观察到systemd按设计延迟从3110730重启到3199988、NRestarts=1，原runner/连接未变；此后所有build-capable gate均在daemon停止时运行，最终daemon3290235收养runner2072452/1687829并保持三条8443、state0600。包为105,320,511 compressed/112,750,654 unpacked/58 entries。真实npm发布升级回滚和macOS/Windows实际执行仍Open。完整证据见`docs/audits/evidence/2026-07-17-release/152-readonly-cli-install-private-tool-cache.json`。

### 2026-07-17 Evidence 153：隔离 npm registry 发布、升级与回滚门禁

- **边界与发布哲学**：本批次使用release流程，但明确限制为临时回环registry；没有版本 bump、生产npm publish、Git tag/push、GitLab release或任何外部发布写入。旧版本使用只服务于回滚机械验证的`1.0.2-drill.0`合成包，候选版本则是当前真实`@artsum/agenthub@1.0.3`完整发布包。由此可以证明npm publish协议、clean consumer、dist-tag与客户端升级/降级，但不能冒充真实1.0.2制品兼容或生产npm回滚。
- **TDD与安全收敛**：首个RED因实现模块缺失失败；真实publish随后依次暴露同步子进程阻塞同进程registry事件循环、npm scoped attachment实际为`@artsum/agenthub-<version>.tgz`、digest篡改仍返回201、`//host/path`能改变代理origin、未完成keep-alive会阻塞server.close，以及`--force`回滚无意义重装整棵依赖并超过命令预算。最终命令全部异步且进程树180秒TERM→5秒KILL；registry只监听127.0.0.1随机端口，使用32-byte随机Bearer/0600临时npmrc、恒时比较、170MiB/4KiB边界、严格身份/attachment、SHA-1/SHA-512、copy-on-write版本/tag、重复拒绝、固定upstream origin与强制连接清理。无效tag/digest不会留下半发布版本。
- **真实旅程与required CI**：pnpm真实完成baseline publish→干净consumer安装与执行→1.0.3 publish→同consumer升级并执行→dist-tag latest回切→同consumer降级并执行。专项最终 **5/5、0 fail、0 skip、89.67s**；release metadata **5/5**，并要求`ci:verify`包含该命令且GitLab `final:verify`执行`ci:verify`。最新完整`ci:verify`退出0：dependency7、Wire pack2、CLI pack/install6、registry5、Web budget2、协议7、env28、Docker10、provenance4、audit3、reachability4、license3、provider policy5、supply-chain policy6，workspace typecheck与metadata也通过。
- **清理与剩余风险**：三次故意中止的RED曾留下1.9G、24K、1.7G临时目录，最终均删除且registry相关进程/目录为0。测试前后daemon PID3290235、runner2072452/1687829、三条8443、`KillMode=process`与state0600不变。未知依赖仍通过固定公共npm origin代理，生产npm、真实旧tarball、protected GitLab、生产Sigstore bundle、Claude许可证决策及macOS/Windows仍Open；ENG-REL-001不能因此标Closed。结构化证据见`docs/audits/evidence/2026-07-17-release/153-isolated-npm-registry-publish-upgrade-rollback.json`。

### 2026-07-17 Evidence 154：Kubernetes 不可变镜像与准入门禁

- **RED与边界澄清**：首个准入契约因renderer模块缺失失败；release metadata又因仍要求`{version}`可变模板得到1 failed/4 passed。真实验证保留了三类非产品假象：Docker Hub一次EOF不计为pull证据；policy更新后未等`observedGeneration`的首个privileged init请求不计为准入通过；完整生产清单在最小集群会先因缺ExternalSecret CRD失败，因此最终使用精确Server Deployment做server-side admission，不把外部CRD前置条件与镜像策略混淆。
- **实现**：生产Server镜像改为唯一全零sha256占位符；`renderKubernetesRelease.cjs`只接受小写`/agenthub-server@sha256:<64位非零digest>`，恰好替换一个占位符，重新解析验证后原子写出。Redis/exporter固定上游digest并补齐非root UID、RuntimeDefault、drop ALL、禁提权与SA token。`ValidatingAdmissionPolicy`以`Fail`/`Deny`覆盖`agenthub-*` Deployment/StatefulSet的CREATE/UPDATE，并对container/init/ephemeral三类容器同时执行digest和安全上下文约束。
- **真实GREEN**：官方checksum校验的kubectl v1.35.1/minikube v1.38.1建立Kubernetes v1.35.1集群；policy generation/observedGeneration为3/3且0 type warnings。immutable Server和Redis分别exit0；mutable tag、全零digest、mutable init、privileged init及Redis live update分别exit1。Redis/exporter ready、0 restart、imageID与固定digest一致，Redis以uid999/gid1000运行并返回PONG。`docker:policy` **2 files/20 tests**、组合metadata/Docker/K8s **3 files/24 tests**、最新完整`ci:verify`均exit0。
- **清理与剩余风险**：集群、1.37GB kicbase、临时工具/文件均删除；production daemon3290235、runner2072452/1687829、三条8443、KillMode=process与state0600保持。内置CEL不能验证Sigstore身份/签名/transparency log；受保护registry、signature-aware生产admission、ExternalSecret生产部署、独立App镜像路径和真实release rollout继续Open，ENG-DKR-001保持In Progress。证据`docs/audits/evidence/2026-07-17-release/154-kubernetes-immutable-image-admission.json`。

### 2026-07-17 Evidence 155：Web 不可变发布与只读运行时

- **RED 与实现**：Web生产清单仍使用`{version}`且80/8080漂移，缺少digest renderer、只读根、资源/滚动边界；release skill同时残留TeamCity、`main`、旧bundle ID和旧目录。失败契约先得到Kubernetes 9 failed/10 passed、release metadata 1 failed/5 skipped，再将renderer扩为显式`server|web`组件，Web只接受非零小写`/agenthub-app@sha256:`，并以UID/GID 101、8080命名探针、只读根、受限emptyDir、`maxUnavailable: 0`和`IfNotPresent`收敛清单；release说明同步为GitLab/master与当前App/Web/Server路径。
- **真实镜像与集群**：最终Web镜像`sha256:ee45511acfb36b9dedaaebc0b604b7e5a0256397c88e7de5081c8380bb7de7e3`为75,659,329 bytes；以`101:101`、read-only、drop ALL、no-new-privileges和三个tmpfs运行，HTTP 200、0 restart、0 warning，`/etc/nginx`写入按预期失败。Kubernetes v1.35.1在策略传播完成后接受immutable Web，拒绝mutable tag、全零digest和`allowPrivilegeEscalation=true`；首次未等待传播而被接受的负向请求不计入通过证据，并由8秒后复验纠正。
- **CI根因与统一GREEN**：完整门禁首次在隔离registry旅程中暴露嵌套`npx/npm exec`完成pnpm后仍驻留至180秒超时；改为复用当前pinned`npm_execpath`，轻量契约由ReferenceError RED转为1/1，registry旅程最终6/6。`docker:policy` **29/29**，最新完整`ci:verify`覆盖dependency、pack、registry、全workspace typecheck、protocol、env、Docker/Kubernetes、SBOM/provenance/audit/reachability/license/provider/metadata并退出0。
- **清理与剩余风险**：Web验证集群、容器、镜像、工具和registry临时目录均清零；production daemon3290235、runner2072452/1687829、三条8443、KillMode=process/state0600保持。镜像基底仍声明80/tcp元数据但产品配置和Kubernetes仅使用8080；CEL仍不验证签名。受保护registry、signature-aware admission、ExternalSecret/真实production rollout/rollback及跨平台release runner继续Open，ENG-DKR-001整体保持In Progress。证据`docs/audits/evidence/2026-07-17-release/155-web-kubernetes-release-and-runtime.json`。

### 2026-07-17 Evidence 156：私有 Registry、签名准入、ExternalSecret 与回滚

- **兼容性RED与生产策略**：Cosign v3 bundle契约先得到 **1 failed/12 passed**；真实Policy Controller对v3 OCI 1.1 referrer最初返回`no signatures found`，与上游已知legacy/bundle兼容缺口一致。生产模板增加`signatureFormat=bundle`及Cosign image-signature predicate，保持精确protected-master identity/issuer、Fulcio与Rekor；真实控制器两个策略generation/observed均2/2、Ready=True。
- **私有签名准入与凭据**：本地registry:3.0.0使用TLS IP SAN和bcrypt鉴权，全部CA/key/password/config为0600且父目录0700。Cosign v2.4.3仅作为本地key legacy控制器兼容工具，checksum固定；未配置Docker凭据时正确`UNAUTHORIZED`。补齐imagePullSecret后，已签名baseline admission exit0，未签名candidate exit1并明确`no signatures found`。这不替代生产Cosign v3 keyless+Rekor正向证据。
- **External Secrets与发布编排**：External Secrets 2.7.0真实CRD拒绝旧`v1beta1`后，生产清单升级稳定`external-secrets.io/v1`；本地dummy fake SecretStore、ExternalSecret均Ready，生成Secret类型与Docker JSON结构通过。编排器现在必须等待ExternalSecret Ready并验证`kubernetes.io/dockerconfigjson`后才能触碰workload。所有子进程仍为executable+argv/shell=false、输出和超时有界。
- **真实rollout/rollback**：安全CEL先拒绝缺`automountServiceAccountToken=false`的测试Deployment。补齐后签名baseline 1/1 Ready；签名candidate以`exit 42`触发`ProgressDeadlineExceeded`，`maxUnavailable=0`保留旧pod。undo已恢复精确baseline digest和1/1 Ready，但立即`rollout status`短暂读取旧deadline而exit1；新增只针对progress deadline、受总timeout约束的重试后exit0，非deadline错误继续立即失败。
- **最终registry可靠性RED/GREEN**：完整门禁在最后一次`pnpm add`已输出`Done`后仍被180秒超时终止；现场pnpm处于`ep_poll`并保留两个公网registry TLS socket，与上游pnpm #12297症状一致。`--prefer-offline`会错误缓存可变`latest`，因此没有用它隐藏问题。新增固定上游metadata/tarball代理：default/scoped registry都指向回环地址，只重写与配置上游精确同源的tarball URL，本地Bearer不转发。两个RED分别为registry **4/5**及npmrc契约 **0/1**；GREEN registry **5/5**，真实发布→升级→回滚连续3轮 **12/12**、无遗留进程。
- **统一GREEN、清理和边界**：`release-image:policy` **14/14**、`docker:policy` **29/29**、registry **9/9**、metadata OK，完整`ci:verify` **129项/0失败、exit0**，7 workspace typecheck与diff check通过。Minikube、1.37GB kicbase、Registry、Policy Controller、External Secrets、工具、CA/私钥/密码及registry演练临时目录全部删除；production daemon3290235、runner2072452/1687829、三条8443、KillMode=process/state0600保持。protected GitLab OIDC、生产registry/Vault/cluster正向keyless发布仍Open，ENG-DKR/SC/REL整体保持In Progress。机器证据`docs/audits/evidence/2026-07-17-release/156-protected-registry-signature-admission-and-rollback.json`。

### 2026-07-17 Evidence 157：当前源码 Web 冷热启动、favicon 与真实 10k 会话

- **RED 与最小修复**：生产根页发现已有`/favicon.ico`后，权限指示器reset仍写入`/favicon.ico?t=<timestamp>`，同一active状态也持续改写DOM并绕过缓存。独立契约首轮 **0/3**；最终仅在私有Web setter中解析现有/目标URL，等价时早退、变化时写稳定本地路径，保留normal/active语义与Amber Crystal资产。
- **当前源码与浏览器证据**：GREEN定向 **3 files/14 tests**、App **243 files/1407 tests**、typecheck、production export/budget均exit0。fresh export为66 files/11,442,026 bytes，单bootstrap **4,080,947 raw/976,588 gzip**、余575,304；三次cache-disabled cold DCL 216.7–221.9ms、FCP 428–436ms，hot reload DCL 62ms/FCP 152ms，favicon只请求`/favicon.ico`一次。旧tracked export与fresh export的较大差异不归因于favicon；直接收益只声明少一次请求及观测约14.8KiB传输。
- **10k/heap与边界**：当前10k/200 replacement p95 **6.061→0.593ms（-90.2%）**；50个inactive×10k消息由128,846,416降至52,198,176 bytes，回收59.5%。真实authenticated E2EE 10k会话三次fresh context可见1.63–1.72s、heap约80.8MB；steady dev scroll p95 47.2ms。100批实时追赶期间dev heap瞬态峰值475MB，明确登记为后续bounded incremental-sync/GC观察，不视为稳定保留heap，也不通过生产凭据或持久化root secret绕过memory-only模型。
- **清理与剩余**：fixture session、private daemon、浏览器、静态server、`bold-harbor`和凭据日志全部清理；production daemon3290235、runner2072452/1687829、三条8443、`KillMode=process`、NRestarts=0与state0600保持。Native、跨平台和production-authenticated性能profile仍Open。机器证据`docs/audits/evidence/2026-07-17-perf/157-release-web-cold-hot-favicon-and-10k-session.json`。

### 2026-07-17 Evidence 158：有界消息追赶提交与真实峰值复测

- **根因、影响与RED**：Evidence157的475,033,024-byte dev峰值追踪到`fetchMessages`同一100页循环每页直接提交全局store。GitNexus MCP持续`Transport closed`，项目本地CLI确认精确property为LOW（1 direct/3 total），所属`Sync`为HIGH（25 direct/117 total），已在修改前警告。首轮缺buffer模块，第二轮 **3 passed/1 failed** 明确helper尚未接入追赶路径。
- **实现与故障语义**：新增1,000条阈值的`MessageCatchupBuffer`，聚合normalized messages及min/max seq；10k/100页提交由100降至10。seq只在同步store commit回调内推进；网络失败或Abort发生在未满阈值partial时不会推进检查点，重试从最近已提交seq继续。初始100条、older pagination、E2EE、realtime单条fast path与loading/timeout状态不变。
- **GREEN与真实性能**：定向 **5 files/27 tests**、typecheck、App **244 files/1413 tests**、production export/budget均exit0；66 files/11,443,014 bytes，bootstrap **4,081,935 raw/976,871 gzip**、余575,021。`wise-prairie`两条真实Codex E2EE会话各写100批/10k；连续39个有效采样捕获峰值307,694,675 bytes，较157下降35.2%，10秒后101,908,392 bytes、DOM879，page errors=0。GC时序会影响dev峰值，因此稳定门禁是确定性的100→10提交契约。
- **清理**：两runner经stop-session归零，非runner清理shell用SIGTERM退出且未用SIGKILL；浏览器、private daemon、Server/Web、`wise-prairie`、凭据日志和export全部删除。production daemon3290235、runner2072452/1687829、三条8443、KillMode=process/NRestarts=0/state0600保持。机器证据`docs/audits/evidence/2026-07-17-perf/158-bounded-message-catchup-commits.json`。

### 2026-07-17 Evidence 159：动态填充态十语言与Session Info无障碍

- **触发与影响**：当前源码比较发现俄/波/西/意/葡/加泰/日七语言的`usage`有24–25个可见字符串仍等于英文，`machine`的停止/重命名/历史及`sessionInfo`的Resume资格状态也保留英文。新边界先稳定复现3/3失败。真实authenticated十语言矩阵进一步证明Session Info在所有语言下为0 main/0 H1；日语axe捕获在线文字#34c759对#f9fbfc仅2.13:1及4个开发JSON滚动区不可聚焦。
- **修复**：补齐七语言25个Usage字符串、9个动态formatter、10个Machine动作和8个Resume恢复状态；技术产品名、命令与ID保持原样。Session Info populated/loading/missing统一main/H1，在线状态使用现有contrast-safe success token。GitNexus确认`SessionInfoContent` LOW；`CodeView`为CRITICAL（5 direct/12 symbols/3 flows），因此只增加默认关闭的可选`accessibilityLabel`，四个Session Info JSON块启用并把全部直接消费端纳入回归，未修改更高半径的`HorizontalScrollView`。
- **真实验证**：`brave-spring`45 migrations中创建真实Codex会话并产生约37K tokens Usage。Usage/Machine/Session Info十语言×320共30状态全部lang/main/H1正确、0横向溢出、0小目标、0目标英文回退；Runner经daemon stop-session正常退出后，七语言Resume 7/7可见且无英文回退。俄语Usage、波兰语Machine、日语Session Info最终axe均0 violations，浏览器page errors=0，localStorage敏感键和值均0。
- **回归与预算**：App全量 **245 files/1418 tests/0 failed/0 pending，27.29s**，typecheck、diff check、production export/budget均exit0；2217 modules，bootstrap 4,082,241 raw/**976,926 gzip**，低于1,551,892门禁574,966 bytes。
- **清理与剩余风险**：私有Runner/app-server归零，browser/helper、Server/Web/private daemon、`brave-spring`、0600凭据日志及临时export全部删除。production daemon3290235、runner2072452/1687829、三条8443、KillMode=process/NRestarts0/state0600保持。该三页Web动态全locale子矩阵关闭；Transfers/File/Workbench等其余动态页、Native TalkBack/VoiceOver、Native Share/App Links及生产association仍Open。完整证据`docs/audits/evidence/2026-07-17-ux/159-dynamic-populated-full-locale.json`。

### 2026-07-17 Evidence 160：动态 Workbench、文件预览与非空 Transfers

- **RED与真实触发**：七语言动态边界稳定发现Compact Context与Tool Group共84处英文回退；文件预览边界发现两个28×28匿名动作、Markdown selector无tab状态、代码区无名称及raw timeout泄漏。真实日语非空Failed Transfer又证明`Document directory is not available on this platform.`进入正文、详情和accessible name；首轮axe另有10个region节点及#999对#fcfdfd仅2.79:1的断线状态。
- **实现边界**：补齐加泰/西/意/日/波/葡/俄七语言动态字符串和formatter。File Preview动作升至具名44点，Markdown使用tablist/tab/selected，代码区具名，异常只展示本地化失败。SessionView两分支提供main，Native compact drawer提供named modal dialog；共享高风险`useSessionStatus`不改，只在Session与Info展示投影使用contrast-safe token。Transfers行、详情和accessible name统一使用本地化错误投影，不向用户暴露内部平台字符串。
- **真实矩阵与回归**：`true-desert`45 migrations创建真实Codex会话；七语言Workbench 320状态全部lang/main/H1正确、0溢出、0小目标、0目标回退。真实Machine RPC打开文件树；真实下载`~/.bash_logout`生成Failed Transfer，日语列表/详情保留失败语义且raw English为0。File Preview和Transfers最终axe均0。定向 **7 files/41 tests**，App全量 **247 files/1429 tests/0 failed/0 pending，27.34s**，typecheck/diff check/export/budget exit0；bootstrap 4,083,232 raw/**977,079 gzip**，预算余574,813 bytes。
- **清理与剩余**：意外直接runner与目标fixture runner均经daemon stop-session退出；browser/helper、Server/Web/private daemon、`true-desert`和临时axe/export/log全部删除。production daemon3290235、runner2072452/1687829、三条8443、KillMode=process/NRestarts0/state0600保持。Web动态主路径子矩阵关闭；Native TalkBack/VoiceOver、Native文件/传输、Share Sheet/App Links及生产association仍Open。完整证据`docs/audits/evidence/2026-07-17-ux/160-dynamic-workbench-full-locale.json`。

### 2026-07-17 Evidence 161：CLI plan-mode integration fail-closed 接线

- **不可达RED**：仓库已有三条真实Claude plan-mode integration，但CLI `test:integration`只运行empty/authenticated项目，protected provider-matrix也不执行、不留artifact，因而长期可被“存在测试文件”误判为已纳入门禁。新增策略首轮 **0/4**，同时证明缺少输出verifier。
- **实现**：`test:integration`加入`integration-plan-mode`；protected schedule要求`CLAUDE_CODE_OAUTH_TOKEN`或`ANTHROPIC_API_KEY`，运行approval、denial、历史bypassPermissions三场景并保存`reports/provider/plan-mode.log` 30天。独立verifier逐场景要求`✓`且拒绝`↓`、缺失或pass+skip，同一策略进入root `provider-matrix:test`和`ci:verify`。运行时plan-mode代码未改。
- **验证与诚实边界**：plan/provider策略 **9/9**、supply-chain **6/6**、metadata 0 issue、CLI unit **115 files/773 tests/0 fail，100.17s**、typecheck exit0。本机Claude CLI 2.1.206存在但无受保护credential，真实plan-mode项目为 **1 file/3 skipped/exit0**；新verifier明确exit1并列出三条skip，因此这不是Provider绿线。首次protected GitLab schedule无skip运行仍开放。
- **进程治理**：首次probe global setup触发共享CLI build，systemd按设计从3290235自动重启到1632077且两个runner不断线；随后显式stop daemon后运行unit/build，再start为1656724并完整收养runner2072452/1687829。最终唯一daemon、daemon list/process一一对应、三条8443、KillMode=process/NRestarts0/state0600正常。完整证据`docs/audits/evidence/2026-07-17-ci/161-cli-plan-mode-integration-gate.json`。

### 2026-07-17 Evidence 162：authenticated Web memory-only root-secret required E2E

- **风险/触发/影响**：Web authenticated启动、桌面Settings导航和完整刷新若未真实回归，查询凭据未擦除、root secret进入持久Storage、失败artifact带凭据或环境未清理都可能破坏已接受的“刷新后重新登录、root secret只驻内存”模型。源码证据为`tokenStorage.ts`、`devWebCredentials.ts`、新runner与`.gitlab-ci.yml`。
- **RED与实现**：缺Playwright/runner/required job/sanitizer/cleanup契约时 **0/5**；真实浏览器继续捕获pnpm分隔符、响应式桌面语义和RoundButton role差异。现精确固定Playwright 1.61.0及官方noble镜像manifest digest；runner用executable+argv/shell=false启动`authenticated-empty --no-switch`，CI不输出Auth URL，只在URL擦除后截图，local/sessionStorage同时拒绝凭据字段和值，JSON/JUnit/error脱敏且禁trace/video，finally强制doctor/down/remove。
- **验证**：真实1440×1000 Chromium **4/4**、page errors 0；authenticated HomeOverview、Settings零横向溢出、刷新回登录页均通过，三项清理exit0且环境删除。策略 **6/6**、认证 **7/7**、env **28/28**、supply-chain **6/6**、App typecheck/frozen install/YAML/diff均exit0。生产daemon1656724、runner2072452/1687829与三条8443保持。
- **状态与剩余**：APP-SEC-004继续Closed，ENG-TST本子项Closed；ENG-CI仍待首次GitLab retained artifact。RoundButton未暴露button role（P2）和Settings桌面侧栏黑色空区视觉一致性（P2观察项）转入UX-A11Y-001/UX-FLOW-001的frontend-design审查，不在本批改变UI。完整证据`docs/audits/evidence/2026-07-17-ci/162-authenticated-web-e2e-required-gate.json`。

### 2026-07-17 Evidence 163：共享 RoundButton button role

- **风险与调用面**：登录控件肉眼可见但不在Chromium button accessibility tree，影响键盘、屏幕阅读器与语义自动化；同一组件还承载创建账户、恢复、Server、Connect和空状态动作。GitNexus query/impact/detect均因`Transport closed`不可用，手工按中等共享组件风险处理。
- **设计与实现**：遵循frontend-design约束保持Amber Crystal raised pill的尺寸、渐变、阴影、文案、按压和异步动作不变。Pressable现在复用统一action props：标题为label，loading发布busy，loading或disabled发布disabled，原有press guard继续保留。
- **RED/GREEN**：组件边界先为 **2 failed/3 passed**，E2E策略先为 **6 passed/1 failed**，证明旧runner仍靠可见文本。修复后定向 **5/5**、策略 **7/7**、App全量 **248 files/1431 tests/0 failed**、typecheck exit0。真实authenticated刷新以`getByRole(button)`命中，4/4安全E2E、page errors 0、三项清理均0且环境删除。
- **构建与状态**：production export 2217 modules，bootstrap **4,083,365 raw/977,108 gzip**、余574,784；daemon1656724、两个runner、三条8443与KillMode=process/NRestarts0不变。Web RoundButton role关闭；Native TalkBack/VoiceOver与Settings桌面侧栏视觉观察仍开放。完整证据`docs/audits/evidence/2026-07-17-ux/163-round-button-accessibility-role.json`。

### 2026-07-17 Evidence 164：Settings 桌面侧栏视觉诊断

- **触发与源码证据**：Evidence162预览曾显示左侧黑区，但SidebarView header/container和MainView empty surface都使用同一grouped background，Settings没有主题切换逻辑，因此预览不足以证明产品缺陷。
- **RED与门禁**：策略 **7/8 RED** 证明真实E2E未比较导航前后颜色/高度；首次浏览器诊断因测试仍期待旧标签`Sessions`而超时，实际运行时规范标签为`Terminals`，环境仍由finally清理。最终视觉采集通过Chromium accessibility tree定位`navigation / Terminals`，确认不是地标缺失。
- **真实结论**：authenticated E2E **5/5**。首页与Settings侧栏computed background都为`rgb(238,244,246)`、高度1000等于1000px viewport；独立PNG `(180,500)`两图同为`srgb(238,244,246)`，Settings主区为`srgb(233,240,242)`。黑区是图像预览呈现伪影，不是App样式缺陷，因此没有错误修改Amber Crystal主题。
- **状态**：策略 **8/8**、真实E2E **5/5**、diff check 0、page errors 0、doctor/down/remove全0；颜色一致性、viewport铺满与命名导航地标现为required真实回归。该视觉观察及Web navigation landmark均Closed，Native/Tauri仍开放。完整证据`docs/audits/evidence/2026-07-17-ux/164-settings-sidebar-visual-diagnostic.json`。

### 2026-07-17 Evidence 165：固定主机重复性能基准

- **Phase 1边界复核**：本机重新确认Gemini/OpenClaw executable、credential和live gateway均不存在；protected Provider矩阵继续fail-closed，未用skip、synthetic key或契约测试冒充真实故障绿线。
- **RED与实现**：固定基准runner缺失时策略 **0/1**；新增`runAppPerformanceBaseline.cjs`统一执行五轮10k replacement与50×10k inactive fixture，记录base commit、相关源码SHA-256、CPU/内核/Node/V8、完整样本和指标语义。每轮必须保持fixture一致、p95改善≥75%、inactive回收≥50%；轻量runner契约纳入`ci:verify`，高分配基准保留为显式命令。
- **结果**：策略 **3/3**；五轮基准exit0、4/4 gates。当前p50/p95中位数为 **0.230/0.508ms**，每轮p95改善至少 **91.4%**。50×10k最大GC稳定加载heap增量 **128,925,472 bytes**，保留20会话后中位数 **52,126,640 bytes**，每轮回收59.5%–59.6%。
- **边界**：Node数字是显式GC后的分配差值，不冒充浏览器瞬时峰值；Evidence158的真实authenticated dev-browser峰值307,694,675 bytes继续独立保留。固定Linux基准待办Closed，Native、production-authenticated、macOS/Windows profile不由本证据关闭。完整证据`docs/audits/evidence/2026-07-17-perf/165-fixed-host-performance-baseline.json`。

### 2026-07-17 Evidence 166：Devices 状态与真实断网恢复

- **问题与设计**：MachinesView只按数组长度判断空态，首次同步和断网空缓存都会误报No Devices；已有缓存则继续显示online。按frontend-design约束保留Amber Crystal和远程工作信息架构，不增加伪refresh或第二套健康仪表盘，只补状态投影与紧凑notice。
- **RED/GREEN**：状态模型/边界先为1 failed+1 missing suite；离线错误分类先missing suite。真实E2E又依次暴露Devices/View devices模糊定位、移动布局错误等待桌面connected status，以及首张离线截图逐字换行、缓存online和artifact console-error toast。最终纯状态/边界/错误分类 **3 files/11 tests**、E2E策略 **9/9**、App全量 **251 files/1442 tests**、typecheck均exit0。
- **真实页面**：Chromium 320×844物理offline后，Connection interrupted为named polite status，缓存设备仍存在且明确offline；Connection settings纵向完整，Transfers与Device Actions均44×44，overflow -10px；恢复网络后notice退出。完整authenticated回归 **6/6**、page errors 0、清理全0。PNG SHA-256为`31c5f38d…343`；查看器黑带由实际sRGB像素排除。
- **构建与边界**：production export 2219 modules，bootstrap **4,088,725 raw/978,147 gzip**、余573,745。Group Actions具名/44点契约保留，但authenticated-empty不生成自定义分组，真实rename/reorder/delete以及Native/跨平台仍开放。完整证据`docs/audits/evidence/2026-07-17-ux/166-devices-operational-states-and-offline-recovery.json`。

### 2026-07-17 Evidence 167：Devices 自定义分组完整旅程

- **范围**：不改产品逻辑、不调用API种子或dev route，只通过真实production UI完成`Device Actions → Move to Group → New Group`、重命名、置顶排序和删除，并验证含设备组删除后设备回到Ungrouped。
- **RED/GREEN**：策略先为 **9/10**；真实Chromium前两轮分别暴露组标题实际合并数量`E2E Alpha (1)`以及误用不存在的`Page.getByDisplayValue`，两轮finally清理均全0。修正为真实标题模式和prompt placeholder后，语法exit0、策略 **10/10**。
- **真实页面**：最终authenticated Web **7/7**、96,871ms、page errors 0。依次创建Alpha、改名Beta、创建Gamma、Gamma置顶后以实际y坐标确认位于Beta上方，再删除Beta/Gamma并确认`Ungrouped (1)`与Device Actions恢复；doctor/down/remove全0、环境删除、孤儿浏览器/Expo进程0。
- **证据边界**：截图SHA-256为`43c852f2…7cab`；PNG为无Alpha的1440×1000 sRGB TrueColor，预览黑块由像素探针排除。Linux/Web自定义Group Actions旅程Closed；Native辅助技术、Tauri、macOS/Windows与首次GitLab retained artifact仍开放。完整证据`docs/audits/evidence/2026-07-17-ux/167-devices-custom-group-lifecycle.json`。

### 2026-07-17 Evidence 168：ACP idle backend fatal 与 Provider 门禁升级

- **缺口**：protected Provider矩阵原本把ACP idle阶段定义为主动`stop-session`，只能证明协作退出，不能证明真实外部backend在没有active turn时意外崩溃后的归档与turn完整性。
- **RED→GREEN**：先把策略期望升级为精确idle fatal场景，验证器 **4/6 passed、2 failed**，分别锁定旧默认矩阵和缺失真实用例。新增真实`opencode acp` idle子进程SIGKILL后，验证器 **6/6**、CI policy **6/6**、CLI typecheck exit0；`.gitlab-ci.yml`精确筛选同步升级，missing/skip/pass+skip仍fail-closed。
- **真实故障**：`crisp-island`单场景 **1 passed/30 non-target skipped**、9.368s；`grand-meadow`统一idle+active fatal **2 passed/29 skipped**，场景9.392s/15.078s、总81.44s。idle路径Server `active=false/thinking=false`，解密metadata为`archived/archivedBy=cli`，且所有E2EE session envelope均无`turn-start/turn-end`；active路径继续保持唯一`turn-end(failed)`。
- **统一回归与边界**：ACP 13/13、ShutdownCoordinator 12/12（五Provider×startup/idle/active合约）、App stopping/exited/timeout/not-found/archived 31/31、Wire RPC 9/9、CLI全量 **115 files/773 tests** 均exit0。生产实现未改。Linux ACP idle/active backend fatal子矩阵Closed；本机无Gemini executable/key，live OpenClaw、macOS/Windows和首次protected provider artifact仍开放。完整证据`docs/audits/evidence/2026-07-17-lifecycle/168-acp-idle-backend-fatal-provider-gate.json`。

### 2026-07-17 Evidence 169：当前源码 authenticated daemon 全量回归

- **目的**：证据168完成ACP idle fatal定向门禁后，不以定向结果外推整套daemon可靠性；从当前working tree执行完整`integration-authenticated` daemon suite。
- **结果**：隔离环境`clever-mountain`完成45 migrations；**1 file / 29 passed / 2 skipped / 31 total，exit 0，342.81s**。完整覆盖stop/timeout、Server不可用finally清理、adoption/journal/reconnect、单daemon和signals、bundle activate/三类rollback，以及Codex/Claude/ACP真实idle/active终态收敛。两个skip仅为本机无Gemini executable/有效credential，未计入通过或伪造绿线。
- **治理与阶段判定**：环境已down/remove，孤儿private daemon/runner/Vitest/OpenCode为0；生产systemd daemon PID1656724仍为`active/running`、`KillMode=process`、`NRestarts=0`，runner2072452/1687829与daemon list及两条runner 8443连接一致（连同daemon共3条）。Linux当前源码authenticated daemon gate Closed；整体主开发仍在Phase 4收尾，但Phase 1的有效Gemini、live OpenClaw、macOS/Windows及首次protected no-skip artifact继续Open。完整证据`docs/audits/evidence/2026-07-17-lifecycle/169-phase1-authenticated-daemon-current-full-regression.json`。

### 2026-07-17 Evidence 170：当前源码 Phase 4 required CI、真实 Web 与供应链刷新

- **本地聚合**：`CI=1 npx -y pnpm@10.11.0 run ci:verify`退出0，枚举测试 **147/147**，另有CycloneDX fixture、7 workspace typecheck、`metadata ok=true`和diff check通过。覆盖dependency boundary、Wire/CLI hermetic pack、隔离registry升级回滚、Web/性能策略、协议、环境、Docker/K8s、签名release、SBOM/provenance/audit/reachability/license/provider门禁契约。该命令只证明本地策略/确定性契约，不替代真实required job。
- **真实required Web**：单独运行`pnpm web:e2e`，Chromium **7/7**、page error 0、97.382s；验证URL擦除、Web Storage无root secret、320×844 Devices物理断网缓存恢复、分组create/rename/pin/delete、Settings无溢出、侧栏一致和刷新回登录。JSON/JUnit均0600；doctor/down/remove全0，环境与浏览器/Expo/private daemon清零。
- **真实供应链与阻断**：当前`pnpm audit`覆盖2268依赖且全严重度0，reachable high/critical 0；固定digest OSV为0 result/0 vulnerability；CycloneDX为2233组件、327,459 bytes，hash provenance `valid=true`。生产许可证1550包中仍只有`@anthropic-ai/claude-agent-sdk@0.2.96`为Anthropic专有条款，`license:check`按设计exit1。不得以allowlist或伪SPDX放行；需要明确产品/法务接受或移除依赖。
- **阶段边界**：本地Phase 4聚合与当前锁文件漏洞子门禁Passed；Phase 4仍因许可证决策、protected GitLab OIDC/no-skip artifacts、生产registry/Vault/cluster/npm及macOS/Windows制品而In Progress。生产daemon1656724、runner2072452/1687829、三条8443、KillMode=process/NRestarts0保持；临时OSV/helper镜像已删除。完整证据`docs/audits/evidence/2026-07-17-ci/170-current-required-ci-web-and-supply-chain.json`。

### 2026-07-17 Evidence 171：当前源码 Android production arm64 APK

- **构建**：以production variant、`https://agenthub.yzsd.asia:8443`、arm64-v8a和release签名执行正式脚本；production prebuild后Gradle **1702 tasks（1029 executed/673 cache）**、`BUILD SUCCESSFUL`、脚本计时191s。签名密码仍通过`ORG_GRADLE_PROJECT_*`环境属性，不进入argv。
- **交付与独立验证**：生成`artifacts/agenthub-production-arm64-20260717-1157.apk`并刷新latest，两者均54,487,098 bytes、0600、SHA-256 `a20e9bb4…7b08`且逐字节相同。独立脚本对两份产物均exit0：`com.artsum.agenthub` 1.0.0、minSdk24/targetSdk36、仅arm64-v8a、APK Signature v2、ZIP与必需bundle/manifest/lib完整；签名证书SHA-256为`6b2c1ff1…19e4`。
- **生产边界与清理**：Hermes strings中正式Server URL恰有1处，七个Dev/QA marker均0；构建/Native QA策略5/5、APK路径2/2。production canonical prebuild未给tracked Android树增加diff，Gradle daemon已停止，无Gradle/Kotlin/Metro/Expo/build孤儿；生产daemon/runner/8443不变量保持。
- **诚实边界**：ADB存在但无连接设备，因此没有把静态APK升级为arm64真机安装、启动、TalkBack或真实运行旅程证据。SDK XML兼容warning和Gradle 10 deprecation继续记录为工具链维护项。完整证据`docs/audits/evidence/2026-07-17-native/171-current-production-arm64-apk.json`。

### 2026-07-17 Evidence 172：当前源码 Linux Tauri production 制品与真实运行

- **回归与构建**：Tauri credential/storage/security/platform定向 **4 files/16 tests**、`cargo check --locked`和`cargo test --locked --lib`均exit0；Rust目前0个lib unit test，因此后者只算编译/链接门禁。首次误用`CI=1`被Tauri CLI以exit2拒绝，如实记录；改为`CI=true`后production export、Rust release及deb/rpm/AppImage全部成功。bootstrap **4,088,744 raw/978,156 gzip**，预算余573,736 bytes。
- **制品独立检查**：仓库`artifacts/`保留的deb/rpm/AppImage分别为6,723,894/6,725,383/81,230,328 bytes，权限0600/0600/0700，SHA-256为`c4cb2ea8…8e15`、`4075b827…6838`、`6f308f35…dd64`。deb为`agent-hub` 1.0.0 amd64，rpm与deb均包含binary/desktop/三种图标；AppImage可独立extract，内部`usr/bin/app`为x86-64 PIE ELF且无临时目录残留。
- **真实Linux桌面运行**：一次性HOME/XDG、Xvfb、D-Bus和GNOME Secret Service中先完成write/read/delete，再启动production binary。主进程与WebKit Network/Web子进程稳定存活，创建真实`AgentHub` 800×600窗口；主智能体查看PNG确认完整登录页而非黑色root window。运行时无localhost:8081连接，SIGTERM清理成功且未升级SIGKILL；隔离App/Xvfb/目录残留为0。截图`reports/tauri/current-production-login.png`为44,041 bytes、0600、SHA-256 `51c410de…23e2`。
- **静态与外部边界**：Tauri配置导致release binary仍含1处`http://localhost:8081` devUrl字符串，但production dist为0处且真实网络为0连接，二者同时留证而不混淆。当前只关闭Linux当前源码制品、Secret Service和未认证production WebKit运行子门禁；authenticated Tauri、真实桌面登录会话中的keyring持久性、macOS/Windows打包签名/公证/更新回滚仍Open。登录页“mobile client”文案登记为产品措辞复核项，不在发布验证批次改变产品哲学。完整证据`docs/audits/evidence/2026-07-17-native/172-current-linux-tauri-production.json`。

### 2026-07-17 Evidence 173：Tauri authenticated credential lifecycle TDD

- 用户将后续执行方式调整为集中实现、TDD定向门禁和阶段统一自动化回归，并停止新增图形化验证。现有Evidence 172的真实Secret Service write/read/delete继续作为操作系统安全存储边界，不再重复启动窗口。
- 新增状态化Tauri存储生命周期契约，模拟WebView重载后从Rust keyring恢复、注销删除、再次重载保持未登录；同时复用account runtime门禁证明shutdown失败仍继续清理持久化与凭据，malformed payload继续fail-closed。定向 **3 files/14 tests**、App统一回归 **251 files/1443 tests**、App typecheck、Cargo locked lib gate均exit0。
- `keen-river`的Server/Web/private daemon共3个进程已正常停止并删除环境，`/tmp/agenthub-tauri-auth-current`已清理，匹配残留为0。Linux authenticated credential lifecycle由Open改为Closed；macOS/Windows签名、公证、安装和更新回滚仍需protected runner。完整证据`docs/audits/evidence/2026-07-17-native/173-tauri-auth-lifecycle-tdd.json`。

### 2026-07-17 Evidence 174：Native QA automated-contract gate

- 新Native QA不再生成或要求Android/iOS截图。Android production runner继续强制APK路径/签名、正式包名、arm64 ABI、前台MainActivity、`AgentHub` UIAutomator语义及logcat无ANR/FATAL；iOS继续强制app目录/bundle、simctl install/launch/log以及同一设备的八项安全自动化证据。
- 聚合报告增加`verificationMode=automated-contract`；只有该模式可无截图完成，历史报告仍走原PNG路径、签名、唯一性和完整性检查，避免借迁移放宽既有证据。RED **3 failed/4 passed**，GREEN Native QA **9 files/67 tests**、App统一回归 **251 files/1444 tests**、typecheck全部exit0。
- 该项关闭Native QA图形化门禁和自动化实现缺口，不冒充Android arm64设备或macOS/iOS runner已经执行。完整证据`docs/audits/evidence/2026-07-17-native/174-native-qa-automated-contract-gate.json`。

### 2026-07-17 Evidence 175：required Web browser-free contract gate

- required GitLab Web job由Playwright/authenticated dev环境迁为纯Node/Vitest契约，不再启动浏览器、截图或人工点击；CI入口自身先验证job、JUnit、依赖与旧runner删除状态。
- TDD RED为**0 passed/3 failed**；GREEN为CI拓扑**3/3**、App Web契约**10 files/54 tests**。精确GitLab命令生成JUnit **54/0**、14859 bytes、0600、SHA-256 `be10764a…688`。
- 直接root Playwright依赖和两个standalone runner已删除；offline lockfile/frozen install均exit0，现有安装减少179包。`@vitest/browser-playwright`仅作为codium Vitest的optional/transitive锁文件项保留，不是root依赖且required job不执行它。
- 最终当前源码`npx -y pnpm@10.11.0 run ci:verify` exit0；7 workspace typecheck及既有pack、环境、Docker/K8s、release、SBOM/provenance、audit/reachability/license/provider策略全部通过。浏览器未启动、孤儿0；生产daemon1656724、runner2072452/1687829、三条8443、KillMode=process/NRestarts0保持。
- 本地required Web契约子门禁Closed；首次protected GitLab执行、retained JUnit及其他生产/跨平台外部证据仍Open。完整证据`docs/audits/evidence/2026-07-17-ci/175-browser-free-required-web-contract.json`。

### 2026-07-17 Evidence 176：当前 App coverage/JUnit 单次门禁

- 当前真实coverage全量为 **251 files/1444 tests/0 fail/0 skip**；S/L **36.53%（30014/82155）**、Branches **77.63%（3999/5151）**、Functions **45.17%（1222/2705）**。旧门禁仍停留在33.35/75.85/30.88，落后于已经记录的34.10/76.22/33.01，允许显著回退。
- 阈值TDD先得到**2 passed/1 failed**；required单次执行策略再得到**3 passed/2 failed**。最小修复将当前覆盖率写为非下降阈值，并让`test:ci`一次同时生成coverage与JUnit，GitLab `app:test`删除第二次重复全量。
- GREEN策略**2 files/5 tests**。精确required等价命令17.47s、exit0，JUnit **1444/0/0**；JUnit、summary和lcov均0600并保存SHA-256。测试范围、coverage reporters与GitLab artifacts均未减少。
- root `check` exit0：7 workspace typecheck、Server协议5/5、Wire协议2/2、diff check通过。浏览器未启动、孤儿0；生产daemon1656724、runner2072452/1687829、三条8443、KillMode=process/NRestarts0保持。首次protected GitLab执行仍Open。完整证据`docs/audits/evidence/2026-07-17-ci/176-current-app-coverage-junit-single-pass.json`。

### 2026-07-17 Evidence 177：protected GitLab 发布证据采集

- ENG-CI-001此前只有本地配置契约，缺少一个可复现、失败关闭且不泄露凭据的外部证据采集入口。新增`gitlabReleaseEvidence.cjs`，直接从`.gitlab-ci.yml`推导20个required jobs与11个retained-artifact jobs，避免手写清单随CI漂移。
- 校验边界包括精确40位SHA、目标project、default/protected master、force-push=false、active master schedule、精确SHA successful pipeline、required job success/allow_failure=false、artifact非空。只允许HTTPS或回环HTTP；令牌只能从环境进入header，报告原子0700/0600。
- TDD依次保留模块缺失0/1、根接线缺失8/1、继承模板缺失8/1三次RED；最终 **9/9**。无凭据真实探针exit1、无报告；当前源码完整`ci:verify` exit0且未启动浏览器。
- origin/master与本地均为`5c74ea1e`，但本机无`glab`且现有Git凭据访问GitLab API为401，故没有伪造protected通过。采集器本地子项Closed；首次protected master/schedule/artifact、OIDC签名、Provider和跨平台外部证据仍Open。完整证据`docs/audits/evidence/2026-07-17-ci/177-gitlab-release-evidence-collector.json`。

### 2026-07-17 Evidence 178：GitLab API 分页与 latest retry

- 发现采集器只读取schedule、exact-SHA pipeline和include_retried jobs的第一页；大项目或重试较多时，会漏掉后页中的有效证据并错误拒绝发布，也可能无法用全局最高job id确认最新重试。
- 以第一页为空、第二页有效fixture得到 **0/1 RED**。最小修复跟随`X-Next-Page`合并全部页，jobs按ID降序后按名称选择最新项；非法、不递增和超过100页的响应全部失败关闭。
- GREEN **13/13**；完整当前源码`ci:verify` exit0，覆盖registry9/9、Web 3+54、7 workspace typecheck、环境28/28、Docker/K8s29/29、签名发布14/14及供应链。未启动浏览器，daemon/runner/三连接保持。分页风险Closed；真实protected执行仍Open。完整证据`docs/audits/evidence/2026-07-17-ci/178-gitlab-api-pagination-and-retry-selection.json`。

### 2026-07-17 Evidence 179：GitLab API 有界传输

- 新增审计发现：外部GitLab请求没有deadline和瞬时重试，redirect遵循fetch默认，且无Content-Length时先完整`text()`再检查大小，可能造成CI永久等待、短暂503误失败、重定向凭据边界不明确及大响应内存压力。
- 六类RED逐项证明缺口；最小实现为每attempt独立AbortController、默认15秒、429/502/503/504最多3次且取消旧body、禁止redirect、Content-Length与ReadableStream实际字节双重2MiB上限。四项环境配置必须在请求前通过整数范围校验。
- GREEN **18/18**，当前源码完整`ci:verify` exit0，Web契约3+54、typecheck7/7、环境28/28、Docker29/29、签名14/14、Provider10/10、供应链6/6均通过。无浏览器，daemon/runner/三连接保持。完整证据`docs/audits/evidence/2026-07-17-ci/179-gitlab-api-timeout-retry-response-boundary.json`。

### 2026-07-17 Evidence 180：GitLab 最新 push 与 artifact 新鲜度

- 新增审计发现：同一SHA存在更新失败与旧成功时，旧实现查找任意success；`source=web`和过期artifact也能进入passed报告，且project id未在URL插值前验证。
- 四子项 **0/4 RED**。最小修复先验证并按pipeline id降序，仅取最高ID且要求success；detail再次绑定id/SHA/ref并强制source=push。project/schedule/pipeline/required job全部为正安全整数；artifact expiry须为null或晚于单一capturedAt，非法/缺失/过期均拒绝。
- GREEN **27/27**，完整`ci:verify` exit0；既有Web、类型、环境、容器、签名、Provider与供应链门禁全绿。无浏览器，daemon/runner/三连接保持。完整证据`docs/audits/evidence/2026-07-17-ci/180-gitlab-latest-push-pipeline-artifact-freshness.json`。

### 2026-07-17 Evidence 181：Protected schedule 集成开关

- 新增审计发现：active master schedule不代表`cli:gemini-integration`、`cli:provider-matrix`和macOS/Windows lifecycle jobs会运行；三组job都需要显式opt-in变量。
- 策略推导和schedule执行验证分别 **0/1 RED**。现扫描非隐藏job的effective rules，自动得到三项`true`要求并拒绝冲突；API detail必须与list身份一致，variables须数组、键唯一、值字符串，并逐项匹配env_var。
- GREEN **29/29**、完整`ci:verify` exit0；报告仅保存要求变量名称。无浏览器，daemon/runner/三连接保持。真实GitLab schedule尚因API 401未验收。完整证据`docs/audits/evidence/2026-07-17-ci/181-protected-schedule-integration-switches.json`。

### 2026-07-17 Evidence 182：最近 protected schedule 执行证据

- Evidence181只证明配置，本轮继续发现last pipeline、schedule-only jobs与artifacts未进入release evidence。真实YAML现导出6个必须成功的schedule jobs，其中5个必须保留artifact。
- 五类RED覆盖策略清单缺失、失败last pipeline、skipped job及expired artifact。实现绑定last_pipeline和detail的id/SHA/ref/status/source，完整分页include_retried并按最高job id选最新，复用push的成功、allow_failure、非空和expiry校验。
- GREEN **33/33**，完整`ci:verify` exit0；本轮CLI clean install与registry较慢但有界通过，其他Web/类型/环境/容器/签名/Provider/供应链均绿。无浏览器，daemon/runner/三连接保持。完整证据`docs/audits/evidence/2026-07-17-ci/182-latest-protected-schedule-pipeline-jobs-artifacts.json`。

### 2026-07-17 Evidence 183：Protected schedule 时效窗口

- Evidence182仍允许无限复用历史成功schedule。专项先证明2020流水线会通过，配置测试证明CLI无时效参数。
- 实现以单一capturedAt检查scheduled detail updated_at：非法拒绝、未来最多容忍5分钟、默认最大48小时；环境override在认证请求前限制为1–720小时。
- GREEN **36/36**、完整`ci:verify` exit0，所有既有工程门禁全绿。无浏览器，daemon/runner/三连接保持。完整证据`docs/audits/evidence/2026-07-17-ci/183-protected-schedule-freshness-window.json`。

### 2026-07-17 Evidence 184：GitLab evidence 输出路径与目标规范化

- **风险与触发**：原子writer会跟随输出父目录symlink并对目标目录chmod/write；API URL只验证协议，允许嵌入username/password、query/hash或非API路径，项目路径也允许`..`。受污染runner workspace或CI变量可让私有证据写出预期树，或让鉴权请求指向含歧义的目标。
- **TDD与修复**：symlink与target两类测试先得到 **35 passed/2 failed**。writer现于mkdir前后逐级`lstat`现存祖先并拒绝symlink，且拒绝已有symlink输出叶；API只允许HTTPS/loopback HTTP、无credentials/query/hash/畸形编码/decoded dot traversal且path以`/api/v4`结束，项目路径限制为最长512字符的规范namespace/project段。
- **验证与残余风险**：GREEN **37/37**，当前源码完整`ci:verify` exit0；未启动浏览器。systemd daemon PID1656724、`KillMode=process`、runner2072452/1687829和三条8443保持。Node无openat式目录fd写入，敌对同用户进程理论上仍可制造检查间竞态，因此protected runner必须保持workspace单租户隔离；真实GitLab API执行继续Open。完整证据`docs/audits/evidence/2026-07-17-ci/184-gitlab-evidence-path-and-target-boundary.json`。

### 2026-07-17 Evidence 185：GitLab 鉴权 origin 与证据工作区约束

- **风险与触发**：证据184规范了URL形状，但合法HTTPS攻击者origin仍可接收token；直接absolute或`../`输出也无需symlink即可离开项目artifact树。
- **TDD与实现**：两项先得到 **36 passed/2 failed**。配置现规范校验`CI_SERVER_URL`，并在发送任何鉴权请求前要求API与Server的scheme/host/port一致；保留self-hosted GitLab path prefix。输出以`CI_PROJECT_DIR`为根解析成绝对路径，拒绝空目标和全部目录逃逸，再复用祖先/叶symlink检查与0700/0600原子writer。
- **验证与边界**：GREEN **38/38**，完整`ci:verify` exit0；没有启动浏览器。systemd daemon PID1656724、runner2072452/1687829、三条8443与`KillMode=process`保持。CI管理员同时替换两个URL仍属于受信控制面，真实protected GitLab执行继续Open。完整证据`docs/audits/evidence/2026-07-17-ci/185-gitlab-evidence-origin-and-workspace-confinement.json`。

### 2026-07-17 Evidence 186：Required pipeline 与 master 禁止直接 push

- **风险**：`protected=true`与`force-push=false`仍可允许Developer、Maintainer、特定用户/组或Deploy Key直接写master，项目也可能未启用“pipeline成功才可merge”；因此“required CI”此前未被完整证明。
- **TDD与实现**：无pipeline merge、Developer push、user例外三个不安全场景先失败；Node父测试计数为 **37 passed/5 failed/42 total**。采集器现要求`only_allow_merge_if_pipeline_succeeds===true`，master push access必须存在且全部为level0 `No one`，任何user/group/deploy-key例外均失败关闭，并在安全报告记录`pipelineMustSucceed=true`。
- **验证**：GREEN **42/42**，完整`ci:verify` exit0；无浏览器。daemon PID1656724、runner2072452/1687829、三条8443与`KillMode=process`保持。本地能力Closed，真实GitLab配置与首次required pipeline仍需API认证。完整证据`docs/audits/evidence/2026-07-17-ci/186-gitlab-required-pipeline-and-no-direct-push.json`。

### 2026-07-17 Evidence 187：GitLab 镜像不可变与 registry 瞬时恢复

- **镜像供应链**：全局default仍是`node:20-bookworm`可变tag。统一拓扑测试先 **6/7 RED**，随后将其固定到仓库已用于签名/部署job的Node20 Bookworm digest；策略遍历default、所有job image和services，任何非64位sha256引用都会失败，GREEN **7/7**。
- **真实回归暴露与修复**：首次`ci:verify`不是绿线：npm metadata出现`ERR_SOCKET_TIMEOUT/ECONNRESET`，180秒命令上限后registry drill **8/9、exit1、195s**。新增恢复逻辑先 **0/2 RED→2/2 GREEN**：只对socket timeout/reset、ETIMEDOUT、EAI_AGAIN或既有有界超时重试一次；integrity、认证、publish和tag策略错误不重试。同一私有HOME、隔离registry、consumer和content store被复用。
- **最终验证**：完整真实registry发布→升级→latest回滚为 **11/11、26.16s**；随后新鲜完整`ci:verify` exit0，供应链7/7及全部既有门禁通过。无浏览器，daemon PID1656724、runner2072452/1687829、三条8443与`KillMode=process`保持。完整证据`docs/audits/evidence/2026-07-17-ci/187-gitlab-image-digest-and-registry-transient-recovery.json`。

### 2026-07-17 Evidence 188：Protected / unprotected 依赖缓存隔离

- **风险与触发条件**：GitLab全局cache此前只按`pnpm-lock.yaml`寻址。若项目允许受保护与非受保护流水线共享缓存，使用同一lockfile的非受保护MR可把依赖缓存带入master或schedule发布边界，属于P1跨信任缓存污染风险。
- **TDD与修复**：新策略先 **7 passed/1 failed/8 total RED**；缓存键现同时包含`CI_COMMIT_REF_PROTECTED`与lockfile内容，并显式设置`unprotect:false`。这既隔离信任级别，又保留锁文件变化时的自动失效；frozen install和pnpm内容寻址继续作为纵深防御。
- **验证与残余风险**：专项 **8/8 GREEN**，新鲜完整`ci:verify` exit0；GitLab证据42/42、真实registry 11/11、Docker/K8s 29/29、签名发布14/14及全包类型检查均通过。无浏览器；daemon PID1656724、runner2072452/1687829、三条8443与`KillMode=process`保持。真实protected runner生成的cache key/命中行为仍需首次认证流水线证据。完整证据`docs/audits/evidence/2026-07-17-ci/188-protected-unprotected-cache-isolation.json`。

### 2026-07-17 Evidence 189：pnpm 工具链引导归档完整性

- **能力与风险边界**：Gemini/OpenClaw二进制/凭据、GitLab API token、macOS/iOS/Windows工具链与ADB本轮仍缺失，已有Codex/Claude/ACP证据不重复运行，外部Phase1矩阵保持Open。审查转入可本地关闭的Phase4 P1：`packageManager: pnpm@10.11.0`和显式`corepack prepare pnpm@10.11.0`只固定名称/版本，没有在仓库中绑定下载归档字节，受污染registry响应可先于依赖、测试、SBOM和发布门禁执行。
- **TDD与实现**：npm registry发布元数据返回的SHA-512转为Corepack descriptor格式。策略先 **8 passed/1 failed/9 total RED**；根manifest现固定完整descriptor，GitLab及三个Docker依赖阶段移除version-only prepare并设置`COREPACK_DEFAULT_TO_LATEST=0`，`checkReleaseMetadata`同步要求精确版本+hash，任何漂移失败关闭。
- **验证与残余风险**：GREEN供应链+metadata **2 files/15 tests**，`metadata:check` OK；固定digest Node20容器真实Corepack下载并输出pnpm 10.11.0，Docker/K8s **29/29**。新鲜完整`ci:verify` exit0，供应链 **9/9**，无浏览器。生产daemon/runner/连接不变量保持。未来升级必须显式刷新版本与hash；首次protected GitLab及完整镜像构建仍需外部证据。完整证据`docs/audits/evidence/2026-07-17-ci/189-pnpm-bootstrap-archive-integrity.json`。

### 2026-07-17 Evidence 190：Local Kubernetes 第三方镜像与 Kustomize 加载边界

- **镜像风险**：local overlay仍执行`latest`或implicit tag的Grafana、Prometheus、MinIO、PostgreSQL与BusyBox，同一commit会随远端tag漂移。递归策略先 **19 passed/1 failed/20 total RED**，随后固定明确版本与multiarch manifest digest；通过Docker registry raw manifest逐一重算，五项digest完全一致。Prometheus改用官方distroless变体，既有端口、参数、存储与发现逻辑不变。
- **加载边界根因**：固定校验和kubectl v1.35.1首次默认渲染exit1，原因是`base/kustomization.yaml`读取父目录`../agenthub.yaml`；真实local脚本此前使用`LoadRestrictionsNone`绕过。canonical Server清单迁入`deploy/base/agenthub.yaml`，base仅引用同目录文件，集成脚本删除宽松参数；renderer、signed release orchestrator、release metadata、测试、release skill和部署文档统一新单一事实源。该路径影响手工判为HIGH，GitNexus仍Transport closed。
- **验证与边界**：迁移首轮精简夹具 **49/50** 失败并修复，最终Kubernetes/signed release/metadata/Docker定向 **4 files/51 tests**、metadata check、默认restrictor真实渲染均exit0；完整`ci:verify` exit0，Docker/K8s **31/31**。无浏览器，生产daemon/runner/三条8443保持。`agenthub-server:local`是当前源码本地构建而非第三方远程镜像，生产admission继续拒绝；fresh cluster apply/smoke仍需后续环境执行。完整证据`docs/audits/evidence/2026-07-17-ci/190-local-kubernetes-immutable-images-and-load-boundary.json`。

### 2026-07-17 Evidence 191：Fresh Kubernetes 部署与冷启动门禁

- **真实部署**：官方checksum校验的minikube v1.38.1/kubectl v1.36.2以隔离HOME/KUBECONFIG建立Kubernetes v1.35.1；默认Kustomize restrictor完成真实apply，Server本地镜像构建、45/45 migrations、3/3 Server、Postgres、Redis+exporter、MinIO、Prometheus和Grafana全部Ready，7个远程运行时镜像digest 0偏差，`/health` HTTP 200，`prisma migrate status`确认schema up to date。
- **现场RED与最小修复**：冷集群首次启动时Server早于Postgres/Redis，两个新副本各重启3次并出现P1001/ECONNREFUSED。新增清单契约先得到 **21/22、1 failed RED**，随后仅为Server Pod增加固定BusyBox digest、非root/只读根/drop ALL/限额的`wait-for-dependencies` initContainer；定向回归 **4 files/52 tests** 全绿。相同集群真实重滚后3个init exit code均0、Server **3/3 Ready、restart 0/0/0**、依赖错误0、health 200。
- **聚合与清理**：完整`ci:verify` exit0，其中Docker/Kubernetes **32/32**，未启动浏览器。集群、Server/kicbase镜像、工具、HOME、KUBECONFIG、日志与port-forward全部清理；生产daemon PID1656724、两个runner、三条8443、`KillMode=process`、NRestarts0保持。fresh local cluster smoke子门禁Closed；protected GitLab OIDC、生产registry/Vault/cluster签名发布仍Open。证据`docs/audits/evidence/2026-07-17-ci/191-fresh-kubernetes-smoke-and-cold-start-gate.json`。

### 2026-07-17 Evidence 192：当前可用 Provider 故障子矩阵与私有 CLI 隔离

- **真实进程矩阵**：authenticated server-only环境完成45 migrations；Codex、Claude、ACP各自idle/active故障恢复共 **1 file/6 passed/0 failed/25 filtered、142.32s、exit0**。覆盖app-server/SDK/OpenCode child的SIGKILL、active turn的turn-end/thinking关闭、归档投影及idle不虚构turn；`smooth-maple`及其private进程残留清零。
- **隔离与阶段边界**：环境策略 **28/28、exit0**；共享CLI dist执行前后快照均为`e8ce2c7…add2e43`，证明authenticated构建未重写生产bundle。本机缺Gemini/OpenClaw executable及Provider环境凭据，故只关闭本地已安装后端子矩阵。未启动浏览器；生产daemon PID1656724、两个runner、三条8443、`KillMode=process`、NRestarts0保持。整体仍在Phase 4收尾，Phase 1外部Provider/跨平台/protected artifact门槛继续Open。证据`docs/audits/evidence/2026-07-17-ci/192-provider-fault-submatrix-and-private-cli-isolation.json`。

### 2026-07-17 Evidence 193：独立 Claude CLI transport 与许可证闭环

- **风险与RED**：生产CLI和Codium原先直接依赖专有`@anthropic-ai/claude-agent-sdk@0.2.96`，使required license gate正确阻断；首轮供应链为 **9/10**。外部transport首版又被真实active-turn SIGKILL捕获`code=null/signal=SIGKILL`误判为clean EOF，集成超时；测试全局setup还会重建共享生产dist并触发systemd重启。
- **最小实现**：删除两个workspace与锁文件中的SDK，以`spawn(executable, argv, {shell:false})`启动独立安装、固定版本的Claude Code，接入stream-json输入输出、permission control、interrupt、AbortSignal、有界stderr和signal fatal；Codium复用`@artsum/agenthub/claude-sdk`结构契约。Vitest不再构建共享dist，authenticated集成继续使用私有staged bundle。许可证Unknown只在`unresolvedPackages=[]`时通过，未添加专有allowlist或伪SPDX。
- **验证与边界**：直接门禁另以1827包/2个dev-only ngrok unresolved RED暴露缺少`--prod`，固定生产口径后transport **4/4**、Claude定向 **22/22**、真实active SIGKILL **1/1**、CLI **116 files/777 tests**、Codium **92/92**、license **5/5**、供应链 **11/11**、全workspace typecheck及完整`ci:verify`均exit0；生产清单 **1549包、unresolved 0**。没有浏览器或截图。最终daemon PID770190、NRestarts0、`KillMode=process`、runner2072452/1687829与三条8443一致。许可证本地阻断Closed；protected GitLab、Gemini/OpenClaw有效凭据和跨平台/真机仍Open。完整证据`docs/audits/evidence/2026-07-17-ci/193-external-claude-cli-transport-and-license-closure.json`。

### 2026-07-17 Evidence 194：Provider 工具链冻结完整性与 Node 22 smoke

- **风险与RED**：protected Provider jobs虽写精确版本，仍用`npm install --global`在凭据runner直接解析并执行未入库绑定的归档。首轮策略因缺manifest/lock **0/1 RED**；迁移后旧契约 **15/18**，随后Node20引擎 **0/1**；真实冻结安装又让Claude/OpenCode因postinstall默认拒绝而版本探针失败。
- **实现与验证**：新增非workspace私有manifest与397行lock，四个顶层Provider及全部 **41个** package/platform坐标均有SHA-512；两个job改为pnpm10.11 frozen install和job-local PATH，固定Node22 Bookworm multiarch digest，仅允许四个已锁定且确需构建的包执行脚本。主机四版本及同一不可变容器Node22.23.1/pnpm10.11.0真实smoke均exit0；定向 **2 files/18 tests**、metadata ok、完整`ci:verify` exit0且供应链 **12/12**。无图形化验证；daemon/runner/三连接/NRestarts0保持。本地安装边界Closed，真实protected凭据矩阵仍Open。证据`docs/audits/evidence/2026-07-17-ci/194-frozen-provider-toolchain-integrity-and-node22-smoke.json`。

### 2026-07-17 Evidence 195：Provider 独立供应链证据闭环与 audit 门禁纠偏

- **发现（HIGH）**：Evidence194 的独立 Provider lock 不属于 workspace，根 audit/OSV/SBOM/license job 均未覆盖其41个坐标；进一步真实执行证明旧 `audit:check <报告>` 会忽略输入、重跑根审计并覆写报告，导致37依赖的 Provider 报告被2265依赖的根报告替换，存在绿色误判。
- **TDD 与实现**：SBOM CLI 和供应链策略先分别RED，审计报告不可变测试再以 **3/4** RED固定覆写根因。随后 `generateSbom` 支持显式 `--lockfile`；required CI 为 Provider 分别生成audit/reachability、固定digest OSV、CycloneDX、license inventory，双SBOM共同进入provenance且分别Sigstore签名/验签；`audit:check`改为只读校验给定报告，release metadata同步fail-closed。
- **真实验证与边界**：Provider audit为 **37依赖、全严重度0**，校验前后SHA-256一致；reachable high/critical为空；OSV **0 results**；CycloneDX **41组件**且provenance重算通过。外部工具许可证清单明确保留Unknown 7/MIT 7/Apache-2.0 2，不用产品许可证白名单伪装Claude Code/平台二进制。定向 **23/23**、完整`ci:verify` **exit0（103 node:test + 147 Vitest assertions）**，根生产许可证1549包/0 unresolved。无浏览器；扫描镜像、Provider node_modules与重复测试进程均清理，daemon PID770190、NRestarts0、KillMode=process、两个runner/三条8443保持。真实protected GitLab/OIDC artifact仍Open。证据`docs/audits/evidence/2026-07-17-ci/195-provider-toolchain-audit-osv-sbom-license-coverage.json`。

### 2026-07-17 Evidence 196：Server production runtime 与 Docker context 秘密边界

- **发现（HIGH）**：Server runtime仍复制完整workspace依赖；更严重的是Docker context没有排除嵌套`.env`及本地PGlite data/WAL，约134MB本地状态进入约140MB源码层。PGlite Prisma patch还会透过pnpm hardlink修改内容寻址store，导致后续offline frozen重建失败。
- **TDD与修复**：production stage、非交互、物理重建、context排除、runtime dev依赖和patch hardlink隔离依次先RED；最终`production-deps`在删除既有virtual store后以isolated/no-hoist/offline/frozen方式重建336个生产包，`.dockerignore`排除全部嵌套env/data/log。patch改为全目标预检、临时文件+原子rename；release metadata按已声明stage区分内部引用与外部镜像，仍拒绝未固定digest的外部`FROM`。
- **真实验证与边界**：镜像 **835,602,212→640,645,138 bytes（-23.33%，相对4.83GB原始基线-86.72%）**，context 844.88kB、源码层约680kB；runtime保留tsx/Prisma/Wire而无Vitest/tsc/Vite config及env/data/log，UID10001。独立PGlite完成45 migrations且`/health`为ok。audit2265依赖全0、reachable0、OSV0、SBOM2229组件、生产license1516/0 unresolved；完整`ci:verify` exit0，Docker/K8s34/34。无图形化验证，批次镜像/容器/临时目录已清理；daemon PID770190、两个runner、三条8443保持。protected GitLab/OIDC/registry/Vault/cluster仍Open。证据`docs/audits/evidence/2026-07-17-ci/196-server-runtime-context-secret-and-production-prune.json`。

### 2026-07-17 Evidence 197：Server 编译 Node runtime 与双数据库 smoke

- **风险与TDD**：Evidence196仍以TSX执行生产源码。新编译契约先 **0/1 RED**，Docker策略同时 **10/12**；真实镜像又依次暴露Wire isolated node_modules未复制，以及esbuild越过workspace边界内联Wire后把`cuid2`留在错误解析路径。没有给Server补幽灵依赖，而是复制Wire生产依赖并显式保持`@artsum/agenthub-wire` external包边界。
- **实现**：固定esbuild0.27.2把`main.ts`/`standalone.ts`原子构建为Node20 ESM，内部`@/`模块bundle、第三方external，并为既有Pino transport注入`createRequire`。Docker只复制生产依赖、Wire package/dist、Server package/prisma和`dist/runtime`；默认CMD为`node .../main.mjs`，镜像内无sources、TSX、TypeScript、Vitest和tsconfig。
- **真实验证与边界**：PGlite编译入口在只读根+tmpfs完成45 migrations/health200，PostgreSQL16.14固定digest由镜像内Prisma完成45 migrations，真实默认CMD在只读根+专用data tmpfs health200；两容器SIGTERM均exit0。Server **39 files/145 passed、1 file/2 external skipped**，Docker/K8s34/34，完整`ci:verify` exit0；audit2265全0、reachable/OSV0、SBOM2229、license1516/0 unresolved。镜像为 **640,445,632 bytes**，仅比196再降0.03%，本项关闭动态转译面而不冒充显著减重；独立migration image/runtime manifest继续为P2。证据`docs/audits/evidence/2026-07-17-ci/197-server-compiled-node-runtime-and-dual-database-smoke.json`。

### 2026-07-17 Evidence 198：Server 最小 runtime lock 与独立 migration image

- **风险与RED**：Evidence197在线镜像仍携带Prisma CLI/schema及共享生产依赖。Docker/runtime manifest首轮分别 **2 failed** 与 **1 failed**；真实构建又捕获生成Prisma client解析、adapter exports及auto peer拉入构建工具三类边界。
- **实现**：新增非workspace、独立frozen lock的最小runtime importer；编译产物全部bare external必须由它声明。在线runner仅含177个virtual packages、编译入口、Wire、migrations和生成client，无Prisma CLI/schema/TSX/TypeScript/esbuild/Vite/Vitest；独立migration target保留迁移工具。local Kubernetes改用两个镜像，required CI独立构建/签名migration digest，并将第三种镜像纳入Sigstore admission及独立audit/OSV/SBOM/provenance/license证据。
- **验证与边界**：在线镜像 **640,445,632→370,256,007 bytes（-42.19%，相对4.83GB基线-92.33%）**。PGlite/PostgreSQL各45 migrations、health200、SIGTERM exit0；Server145 passed/2 external skipped；定向runtime/依赖/Docker/签名/供应链 **52/52**，完整`ci:verify` exit0。根audit2265与runtime audit174均全严重度0，reachable/OSV均0，SBOM2229/175。生产按exact digest创建并等待migration Job尚未接入deploy orchestrator，因此本地镜像边界Closed、protected生产迁移编排仍Open。证据`docs/audits/evidence/2026-07-17-ci/198-server-runtime-lock-and-migration-image.json`。

### 2026-07-17 Evidence 199：生产 migration Job 失败关闭编排

- **风险与RED**：独立migration镜像已构建/签名，但Server deploy只消费在线镜像。新增签名发布与Kubernetes契约得到 **34 passed/6 failed RED**，证明缺少第二digest强制、Job安全模板/准入、迁移先行、失败日志/清理及CI artifact依赖。
- **实现**：Server发布现在先验签两个exact digest，再dry-run workload、稳定版ExternalSecret和安全Job；等待`agenthub-secrets` Ready后创建fresh `generateName` Job，Complete并保存0600日志后才apply Deployment。失败时先取日志、删除Job阻止后台继续、写`migration-failed`私有报告，绝不触碰在线Deployment。CEL新增batch/v1 Jobs，GitLab deploy同时needs两份签名artifact。
- **验证与边界**：定向 **5 files/72 tests**、完整`ci:verify` exit0，其中Docker/K8s36/36、release-image17/17；固定checksum kubectl v1.35.1真实渲染base 7文档（ExternalSecret1）与local 19文档（按设计ExternalSecret0），YAML/CI topology/metadata均通过。未使用浏览器。源码编排Closed；无生产凭据，protected manual job与真实cluster artifact仍Open。证据`docs/audits/evidence/2026-07-17-ci/199-production-migration-job-release-orchestration.json`。

### 2026-07-17 Evidence 200：安全分享管理态七语言 TDD

- **风险与RED**：分享管理页具备loading/error/empty/active/expired/revoked/revoke状态，但加泰罗尼亚语、西班牙语、意大利语、日语、波兰语、葡萄牙语和俄语的管理文案仍与英文逐项相同。新增非英语回退门禁得到 **1 passed/1 failed**，首个失败为`ca.externalShares.title`。
- **实现**：仅本地化七个locale的11个管理态文案；不改变E2EE capability、API、撤销逻辑、状态机、路由或Amber Crystal视觉。
- **验证与边界**：分享能力/API/UI与翻译parity定向 **5 files/14 tests/0 failed/0 skipped**，App typecheck和diff check均exit0；按要求不做图形化验证。管理页子矩阵Closed；创建流程和公开解密页的其余七语言英文回退仍由UX-I18N-001跟踪，production HTTPS association与Native handling仍是外部门禁。证据`docs/audits/evidence/2026-07-17-ux/200-shared-links-management-locales-tdd.json`。

### 2026-07-17 Evidence 201：安全分享完整旅程七语言 TDD

- **风险与RED**：Evidence200只覆盖管理页11个key，创建、有效期、复制结果和公开解密错误仍回退英文。门禁改为动态遍历`externalShares`完整命名空间后得到 **1 passed/1 failed**，首个失败为`ca.externalShares.createSecureLink`。
- **实现**：补齐七种语言的创建、有效期、creating/unavailable/create-failed、复制结果以及公开解密loading/not-found/missing-key/invalid-key文案；门禁会自动覆盖未来新增key。不改变E2EE capability、URL/key fragment、API、撤销状态机或视觉。
- **验证与边界**：分享UI/API/capability/origin/native-listener/parity定向 **7 files/17 tests/0 failed/0 skipped**，App typecheck exit0；未使用图形化验证。本地全旅程七语言子矩阵Closed；production HTTPS association/证书和Native设备实际处理仍是外部门禁。证据`docs/audits/evidence/2026-07-17-ux/201-complete-shared-link-journey-locales-tdd.json`。

### 2026-07-17 Evidence 202：繁体中文安全分享脚本门禁

- **风险与RED**：繁体中文分享文案混入多处简体字，单纯英文非回退门禁无法发现。新增脚本纯度测试得到 **2 passed/1 failed**。
- **实现与验证**：修正繁体用字并保留相同产品含义；分享定向 **7 files/18 tests/0 failed/0 skipped**、App typecheck exit0，未使用图形化验证。该命名空间繁简漂移Closed，全局其他命名空间继续由UX-I18N-001跟踪。证据`docs/audits/evidence/2026-07-17-ux/202-traditional-chinese-shared-link-script-gate.json`。

### 2026-07-17 Evidence 203：Devices 分组生命周期七语言 TDD

- **风险与RED**：结构扫描区分需保留的技术术语后，确认七种语言的Devices空组、重名、空组引导、设备操作、详情、置顶与上下排序9项仍逐字回退英文。键级门禁得到 **3 passed/1 failed**。
- **实现与验证**：本地化七语言共63项，不改变分组reducer、持久化、操作语义或视觉。模型/运行态/动态locale/parity定向 **4 files/18 tests/0 failed/0 skipped**，App typecheck exit0，未使用图形化验证。该子矩阵Closed。证据`docs/audits/evidence/2026-07-17-ux/203-device-group-lifecycle-locales-tdd.json`。

### 2026-07-17 Evidence 204：Agent Goal Bar 八语言可见与读屏文案

- **风险与RED**：八个非英语locale的Current/Clear/Stop/Edit Goal及动态读屏标签全部回退英文，影响目标条、编辑弹窗和三个图标按钮。可见字符串与函数结果门禁得到 **4 passed/1 failed**。
- **实现与验证**：本地化八语言共40项，保持目标状态、能力、动作处理和视觉不变。Goal Bar组件、动作处理、parity定向 **3 files/16 tests/0 failed/0 skipped**，App typecheck exit0，未使用图形化验证。该子项Closed。证据`docs/audits/evidence/2026-07-17-ux/204-agent-goal-bar-locales-accessibility-tdd.json`。

### 2026-07-17 Evidence 205：File Preview tab/region 七语言 TDD

- **风险与RED**：File Preview的Source/Preview及少数Diff标签仍回退英文，直接影响tab与代码region名称。精确键门禁得到 **5 passed/1 failed**。
- **实现与验证**：本地化16项；复核后保留`Git Graph`、`detached HEAD`技术术语及意大利语正确同形词`File`，避免机械非等值测试制造伪翻译。parity、无障碍、动态locale、显示模式、预览策略和请求生命周期 **6 files/24 tests/0 failed/0 skipped**，App typecheck exit0，未使用图形化验证。该子项Closed。证据`docs/audits/evidence/2026-07-17-ux/205-file-preview-tabs-locales-tdd.json`。

### 2026-07-17 Evidence 206：目标命令与消息状态八语言 TDD

- **风险与RED**：八语言`/goal`说明与目标消息状态均回退英文，俄语Command Palette同样是明确普通用户词。长句级门禁得到 **6 passed/1 failed**。
- **实现与验证**：本地化17项，保留命令名、模型/产品标识及正确同形词。命令建议、自动补全、会话入口、运行时copy与parity **5 files/36 tests/0 failed/0 skipped**，App typecheck exit0，未使用图形化验证。解析、RPC和消息状态未改；该子项Closed。证据`docs/audits/evidence/2026-07-17-ux/206-goal-command-message-locales-tdd.json`。

### 2026-07-17 Evidence 207：动态 Tool/Todo 摘要函数 TDD

- **风险与RED**：动态翻译函数仍在意大利语/日语输出pattern/path/count/query，并在意/日/波/俄Todo徽标输出英文。对函数实际结果断言得到 **7 passed/1 failed**。
- **实现与验证**：本地化14个函数输出；保留纯箭头、字段拼接、Token/cmd等通用结构和技术词。parity、运行时copy、动态Workbench与工具命令 **4 matched files/19 tests/0 failed/0 skipped**，App typecheck exit0，未使用图形化验证。工具数据、schema和执行逻辑未改；该子项Closed。证据`docs/audits/evidence/2026-07-17-ux/207-dynamic-tool-summary-locales-tdd.json`。

### 2026-07-17 Evidence 208：多语言/状态批次 App 统一回归

- **范围**：Evidence200–207的安全分享、Devices分组、Agent Goal Bar、File Preview、目标命令/消息及动态Tool/Todo变更。
- **验证**：`agenthub-app test:ci` **251 files/1451 tests/0 failed/0 skipped、exit0**；JUnit机器复核251 suites/1451 tests且0600。覆盖率Statements/Lines36.53%、Branches77.73%、Functions46.02%；App typecheck exit0。未使用图形化验证。
- **边界**：本地App批次Closed；Native设备、production App Links/证书及跨平台发布仍为外部门禁。证据`docs/audits/evidence/2026-07-17-ux/208-i18n-state-batch-app-aggregate-regression.json`。

### 2026-07-17 Evidence 209：当前状态文档漂移门禁

- **风险与RED**：权威当前状态摘要把Evidence176的1444测试与旧coverage观测继续当作当前值，同时残留Evidence193已经关闭的许可证阻断，会造成发布判断与真实工作树不一致。缺少检查模块时门禁得到 **0/2 RED**。
- **实现与验证**：新增独立纯文本检查与TDD，强制project status、validation coverage和精简verification matrix共同引用Evidence208的1451测试、B77.73%和F46.02%，保留Evidence176作为非下降阈值，并拒绝许可证阻断回漂；命令已接入根`ci:verify`。GREEN **2/2**、状态issues 0、metadata issues 0、供应链 **12/12**，完整`ci:verify` exit0。
- **边界**：不改写历史证据时点，只修正当前结论；生产GitLab、Provider凭据、Vault/K8s/registry与跨平台设备事实仍需外部证据。证据`docs/audits/evidence/2026-07-17-ci/209-current-documentation-status-drift-gate.json`。

### 2026-07-17 Evidence 210：开发/发布/隐私权威入口漂移门禁

- **风险与RED**：dev/release skills和PRIVACY同时残留TeamCity、GitHub Release/Pages、旧bundle ID、排除protected integration gate及上游issue tracker，足以让操作员走错发布系统、签错包或把反馈发送给无关上游。新增门禁依次暴露缺函数、GitHub Pages冲突和未拒绝旧development ID，三轮均为 **7 passed/1 failed**。
- **实现与验证**：`checkOperationalDocumentation`现统一保护GitLab/master、三环境`com.artsum.agenthub*`、protected integration、自托管docs与AgentHub support，并失败关闭旧引用。最终release metadata **8/8**、metadata issues 0、供应链 **12/12**、当前文档残留扫描0，未使用图形化验证。
- **边界**：根`.npmrc`宽松hoist仍是Phase 4实现迁移；本批遵循集中回归策略未重复Evidence209刚完成的完整CI。证据`docs/audits/evidence/2026-07-17-ci/210-operational-documentation-and-release-skill-drift-gate.json`。

### 2026-07-18 Evidence 219：本机部署、CLI 1.0.4 npm 与 Android production 交付

- **Server**：旧systemd unit在isolated依赖布局下因根`dotenv`路径缺失得到203/EXEC；修正为Server包内可执行路径并同步部署文档。新生产环境校验继续以缺少用途隔离密钥失败关闭；按轮换文档保留旧master为data v1兼容、独立data v2 active，并新建独立token/file signing secret。5个迁移完成，本地与公网health200，service active/running、NRestarts0；秘密值未进入仓库或证据。
- **CLI/npm**：版本提升为1.0.4；unit **107 files/709 tests**、metadata **8/8**、build/typecheck exit0。50文件/105.2MB发布包首次三次PUT因默认网络超时失败且registry无半版本；30分钟有界timeout重试成功，匿名复核`latest=1.0.4`、unpacked112,324,009 bytes。本机全局CLI由同一验证tarball更新为1.0.4，临时npmrc已删除。
- **daemon边界**：`KillMode=process`停止daemon期间两个既有runner保持；1.0.4启动恢复两个持久会话后因安全切换故意废止旧Token得到401。未放宽Token验证或伪造认证，服务停止等待用户`agenthub auth login --force`；最终systemd单实例、runner收养和8443连接列为人工验收。
- **Android与发布说明**：新增Version19中英文changelog，契约由3项版本漂移RED收敛为 **7/7**。随后重新构建production arm64 APK，最终57,909,638 bytes，SHA-256 `9425e0ed…58cf`，包名/SDK/arm64/v2签名/ZIP均通过；本机无设备，安装启动保持非阻塞人工验收。未使用浏览器、截图或图形化验证。证据`docs/audits/evidence/2026-07-18-release/219-local-server-cli-1.0.4-npm-and-android-delivery.json`。
