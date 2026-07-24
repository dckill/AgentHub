# AgentHub 外部 E2EE Capability 分享设计

日期：2026-07-16
状态：Approved for implementation
对应审计：`UX-SHARE-001`、`APP-SEC-002`、`SRV-SEC-001`

## 目标与不变量

本批次只分享用户在 Text Selection 页面明确选择并确认的文本快照，不分享实时会话、账号标识、机器信息、Artifact 密钥或后续更新。它不改变 AgentHub 的自托管和端到端加密哲学。

必须同时满足以下不变量：

1. 客户端生成独立的 32 字节随机分享密钥，并在上传前使用 libsodium SecretBox（XSalsa20-Poly1305，24 字节随机 nonce）加密 UTF-8 JSON payload。
2. Server 只接收并保存 opaque share id、密文、固定 scope、所有者、创建/到期/撤销时间；绝不接收明文或分享密钥。
3. 分享 URL 形如 `https://<trusted-origin>/share/<opaque-id>#key=<base64url-key>`。Fragment 不会发送给 HTTP Server，也不得放入 query、pathname、日志或持久存储。
4. 公开页面读取 fragment 后立即把密钥保留在页面内存，并用 `history.replaceState` 清除地址栏 fragment。刷新清理后的页面必须要求重新打开原始分享链接。
5. 分享固定 scope 为 `selected-text`；第一版 TTL 仅允许 1 小时、24 小时、7 天，默认 24 小时，Server 最大接受 7 天。
6. 所有者可列出并撤销分享；撤销幂等。公开读取对不存在、其他状态、过期和撤销统一返回 404，避免状态枚举。
7. 公开响应设置 `Cache-Control: no-store, private`、`Pragma: no-cache`、`Referrer-Policy: no-referrer` 和 `X-Robots-Tag: noindex, nofollow`。
8. 单条密文上限 64 KiB，账号最多 50 条同时有效记录；撤销或到期 30 天后的记录硬删除。创建、公开读取继续受全局 HTTP 并发和速率限制约束。

## 数据模型

`ExternalShare`：

- `id String @id`：客户端生成 UUIDv4，提供足够熵并使 POST 可幂等重放。
- `accountId String`：所有者外键，账号删除时级联删除。
- `ciphertext Bytes`：包含 SecretBox nonce 与认证密文。
- `scope String`：当前只允许 `selected-text`。
- `expiresAt DateTime`、`revokedAt DateTime?`、`createdAt`、`updatedAt`。
- 索引：所有者/创建时间、到期时间、撤销时间。

Server 不保存 URL、fragment、密钥、明文标题或明文预览。所有者列表也不返回密文，减少误用和日志暴露。

## HTTP 契约

- `POST /v1/external-shares`（认证）：`{ id, ciphertext, scope: "selected-text", expiresInSeconds }`，返回 metadata。相同所有者、id、scope、密文的重试返回既有记录；内容不一致或跨账号碰撞返回 409。
- `GET /v1/external-shares`（认证）：返回最多 100 条 metadata，不含密文。
- `DELETE /v1/external-shares/:id`（认证）：写入 `revokedAt`；同一所有者重复撤销返回同一结果，其他账号和不存在均返回 404。
- `GET /v1/public-shares/:id`（公开）：只返回仍未撤销且未过期记录的 `{ id, ciphertext, scope, expiresAt }`；其他情况统一 404。

## 客户端边界

新增纯模块负责：payload schema、密钥生成、加解密、base64url、严格 HTTPS origin、链接构建与 fragment 解析。网络模块复用统一 `authenticatedHttpClient` / `publicHttpClient`，继承 15 秒 timeout、AbortSignal、结构化错误和有界重试；POST 只有在服务端幂等契约成立时显式标为 idempotent。

Text Selection 保留现有本地 Share Sheet，并新增明确的“创建安全链接”操作与 TTL 选择；不会悄悄把现有分享按钮改成上传。设置页新增“共享链接”管理入口用于查看期限、状态与撤销。

公开 `/share/[id]` 路由不要求登录。页面必须区分 loading、missing/expired/revoked、missing-key、invalid-key、ready；只有认证解密成功后才渲染文本。页面不得将密钥写入 AsyncStorage、SecureStore、localStorage、sessionStorage、日志、错误上报或导航参数。

## 威胁模型与剩余风险

- 拿到完整 capability URL 的人可在到期或撤销前读取内容；这是 capability 的授权语义，UI 必须明确提示用户谨慎转发。
- Server 可删除、拒绝或替换密文，但 SecretBox 认证可阻止替换内容被当作有效明文；Server 仍可观察 share id、密文长度、创建与访问时间。
- 浏览器历史、剪贴板和接收方设备可能保留用户主动复制的完整链接；应用通过 no-referrer、fragment 即时清理和不持久化降低暴露，但不能撤回接收方已复制的明文。
- Universal/App Links 的域名证书和 association 文件属于独立部署门禁；Web HTTPS 分享可先实现，生产启用仍必须通过该门禁。

## 验证门槛

1. Server route RED/GREEN：认证、跨租户、幂等冲突、TTL、quota、尺寸、撤销、统一 404、no-store。
2. App pure RED/GREEN：密钥随机性、往返解密、篡改失败、URL 中仅 fragment 含 key、严格 origin、fragment 清理与 schema 拒绝。
3. App API RED/GREEN：统一 HTTP client、AbortSignal、POST 幂等、public 无 bearer。
4. 路由守卫：只有精确 `/share/<valid-id>` 公开，嵌套路由和其他页面仍需认证。
5. authenticated Web 创建/列出/撤销真实旅程；公开 Web 打开原链接、fragment 清除、解密、刷新失钥、撤销后 404；axe、320 px、页面错误与网络日志检查。
6. Server/App 定向测试、两端 typecheck、Prisma validate、迁移 smoke、阶段聚合回归和证据矩阵更新。
