# AgentHub 用户验收清单（非阻塞）

> 本表只记录当前 Linux 开发环境无法自动执行的验证。它们不阻塞本地功能开发完成，也不得被标记为自动通过。产品范围仅包含 Claude Code 与 Codex。

| 验收项 | 需要的环境 | 用户操作/判定 | 当前状态 |
|---|---|---|---|
| iOS 账号 A→注销→B、慢响应取消、后台秘密隐藏 | macOS、Xcode、iPhone/Simulator | 运行 iOS 自动化契约；确认 B 不显示 A 数据、慢请求被取消、后台与 App Switcher 不显示恢复密钥 | 待用户环境 |
| iOS Mermaid 离线与恶意输入 | macOS、Xcode | 断网运行正常图、语法错误和恶意 `</script>` 用例；不得外跳或执行伪 bridge 消息 | 待用户环境 |
| Android 真机启动与无障碍树 | arm64 Android 设备、ADB | 安装 `artifacts/agenthub-production-arm64-latest.apk`；验证登录、新建、会话、停止、分享和 TalkBack 节点名称/状态 | 待连接设备 |
| macOS/Windows 桌面安装与升级回滚 | 对应平台及签名材料 | 安装 production 包，验证安全凭据存储、重启保持、注销清除、升级与旧版回滚 | 待平台环境 |
| APNs/FCM 推送 | 真机、推送凭据、生产或等价 Server | 用户操作触发授权后注册 token；验证完成、权限请求和问题通知能抵达且深链正确 | 待推送环境 |
| F11 Active Device 双设备控制权 | 两台已登录同一账号的真机或等价客户端、可运行的 daemon/session | 设备 A claim 后可发送；设备 B 只能观察且发送/`session-alive` 写入被拒；B 显式接管后 A 变为 observer；重复 claim/release 幂等；断开后 grace cleanup 不误释放仍在线设备 | 待双设备环境 |
| F11 Smart Push 目标过滤 | APNs/FCM 凭据、至少两个设备 token、可触发 session update 的 runner | active device 不收到自身 session push；observer/legacy token 按兼容规则收到；push 载荷不包含明文消息或密钥；点击通知可正确打开目标 session | 待推送环境 |
| F11 多副本 Socket.IO | 至少两个 Server 副本、Redis adapter、反向代理或等价路由 | 在副本 A 建立 session-control 连接、在副本 B claim/release；控制权事件和 occupied 回读跨副本抵达；断开一个副本不影响另一副本的连接与 grace cleanup | 待多副本环境 |
| HTTPS App/Universal Links | 生产域名、证书、association 文件 | 验证无 key/token 的认证深链、404、参数边界，以及 fragment key 外部 E2EE 分享与撤销/过期 | 待域名配置 |
| 生产多副本与外部存储 | PostgreSQL、Redis、S3、反向代理/Vault | 部署后验证迁移、健康检查、滚动更新、限流、对象存储、密钥轮换和故障恢复 | 待生产环境 |

验收失败时记录平台、版本、精确步骤、预期、实际结果和日志；不要求截图，除非平台商店明确强制。
