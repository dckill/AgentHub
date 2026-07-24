# AgentHub 凭据与 Root Secret 分平台防护设计

**关联审计：** APP-SEC-004、APP-SEC-007
**产品约束：** 保持自托管与 E2EE；root secret 是客户端解密根，不得上传给服务端或用服务端可恢复方案替代。
**已确认决策（2026-07-11，产品方明确接受）：** Web 刷新或关闭页面后需要重新登录，以换取凭据只驻留当前页面内存；这不是临时降级，而是 Web 默认安全策略和后续回归测试必须守住的产品约束。

## 1. 威胁模型与边界

需要防护的敏感值为登录 bearer token 与 E2EE root secret。主要攻击面包括浏览器持久存储被 XSS/扩展读取、Tauri WebView 在无 CSP 下读取前端存储、解锁设备被旁观操作、后台任务预览/截屏、以及剪贴板长期残留。

本设计不能承诺抵御已完全控制当前进程的恶意代码；目标是消除跨重启长效明文、缩短敏感值暴露窗口，并让显示或导出 root secret 成为显式、可审计且经过本地认证的操作。

## 2. 分平台存储

### Web（已批准，第一阶段实现）

- `{token, secret}` 只保存在当前 JavaScript 页面模块内存中。
- 不得写入或读取 `localStorage`、`sessionStorage`、IndexedDB、Cache Storage、Cookie 或 Service Worker 持久缓存。
- 允许不读取旧值、仅删除历史版本的 `auth_credentials` 键，以清理已经落盘的明文。
- 页面刷新、标签关闭、浏览器崩溃或模块重新加载后凭据消失，回到登录流程。
- 注销必须先执行既有原子 account shutdown/reset，再清空内存凭据。

不采用“用 WebCrypto 加密后写入 IndexedDB”：同源 XSS 仍可调用解密路径，不能满足绝不持久化的承诺。WebAuthn/PRF 包装可作为未来独立功能研究，但不能成为当前默认降级路径。

### iOS / Android（既有存储保留，第二阶段加固）

- 登录凭据继续由 Expo SecureStore 写入 Keychain/Keystore，禁止退回 AsyncStorage/MMKV。
- root secret 显示与复制前调用系统设备认证；认证失败、取消或不可用时不展示、不复制。
- App 进入 inactive/background、页面失焦或敏感显示超时后立即隐藏。
- 敏感内容显示期间启用平台防截屏/任务切换预览防护，并在退出时可靠恢复。
- 剪贴板使用敏感/本地标记及短 TTL；平台不支持自动过期时提供明确提示并尽最大努力条件清除，不能误删用户随后复制的新内容。

### Tauri Desktop（实现完成，真实钥匙串验收待补）

- 不得复用 Web 内存策略作为最终持久登录实现，也不得使用 WebView localStorage。
- 通过 Rust command 接入系统钥匙串，前端只接收当前会话所需凭据；命令参数、错误和日志必须脱敏。
- 在可靠接入系统重新认证前，Desktop 设置页不提供 root secret 明文显示/复制。
- production CSP 使用最小 allowlist；`http://**` 能力只允许出现在 dev 配置，production 仅允许配置的 HTTPS/WSS 边界。

当前实现直接使用 `keyring 3.6.3` 的原生后端，不提供静默内存或明文文件回退；未使用的 Tauri HTTP plugin 已删除。由于 Linux Secret Service 当前依赖链使用 Edition 2024，Tauri MSRV 与仓库工具链固定为 Rust 1.85/1.85.1。

## 3. 状态与失败语义

凭据初始化必须区分 `loading | unauthenticated | ready | error`。Web 无内存凭据是正常的 `unauthenticated`，不能被当成存储错误；Native/Tauri 安全存储读取失败进入可恢复 `error`，不得静默创建新身份或覆盖原凭据。任何设置失败都必须保持未认证状态，不能只更新 React 状态造成“看似登录”。

## 4. 验收矩阵

| 场景 | 预期证据 |
|---|---|
| Web 登录后读取 | 同一页面模块内可取得等值凭据 |
| Web 持久化 API | 不调用 get/set；旧 `auth_credentials` 仅 remove |
| Web 刷新 | 新模块实例返回 null，受保护路由进入登录 |
| Web 注销/换号 | 内存清零且既有 account lifecycle 回归全绿 |
| Native 重启 | SecureStore 可恢复；无 AsyncStorage/MMKV 明文 |
| Native 显示/复制 | 设备认证、后台隐藏、防截屏、剪贴板 TTL 的原生测试与真机证据 |
| Tauri 重启 | 系统钥匙串恢复；WebView 存储无凭据 |
| Tauri production | CSP/capability 自动检查，HTTP dev 权限不可达 |

## 5. 交付顺序与关闭条件

1. Web 内存存储 RED→GREEN，完整 App unit/typecheck、authenticated Web 登录/刷新/注销验证。
2. Tauri 系统钥匙串、生产 CSP 与 capability RED→GREEN，打包 smoke。
3. Native 本地认证、生命周期隐藏、防截屏与剪贴板 TTL RED→GREEN，iOS/Android 原生验证。
4. 只有三个平台全部满足对应验收矩阵，APP-SEC-004 才可 Closed；只有 Native/Tauri 敏感显示与复制链路完成，APP-SEC-007 才可 Closed。

Web 第一阶段完成不代表整个 APP-SEC-004/007 已关闭，验证矩阵必须保留剩余风险。
