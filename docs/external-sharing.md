# 加密外部分享

AgentHub 可以把用户选中的文本生成临时外部链接。分享内容在客户端加密，解密 key 放在 URL fragment（`#key=...`）中，不会随 HTTP 请求发送给 AgentHub Server。

## 用户流程

1. 在支持文本选择的页面选中内容并创建分享。
2. App 生成随机分享 ID 和密钥，在本地加密选中文本。
3. App 只把密文、范围和有效期上传到 `/v1/external-shares`。
4. 接收者打开 `/share/:id#key=...`；页面读取公开密文后在客户端解密。
5. 创建者可在“设置 → 已分享链接”查看元数据并撤销链接。

当前分享范围只有 `selected-text`，不表示整个会话、项目或文件已被共享。

## 有效期与限制

- 最短有效期 5 分钟。
- 最长有效期 7 天。
- 单条密文最大 64 KiB。
- 已过期或已撤销的公开读取统一返回不存在。
- 服务端按账号实施有效分享数量配额；达到配额返回 `429 quota-exceeded`。
- 列表接口最多返回最近 100 条元数据。
- 过期或撤销超过 30 天的旧记录会在后续创建时清理。

## API

| 方法 | 路径 | 认证 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/v1/external-shares` | Bearer | 创建加密分享。 |
| `GET` | `/v1/external-shares` | Bearer | 列出当前账号的分享元数据，不返回密文。 |
| `DELETE` | `/v1/external-shares/:id` | Bearer | 撤销自己的分享。 |
| `GET` | `/v1/public-shares/:id` | 无 | 读取未过期、未撤销的密文。 |

公开读取响应设置 `no-store`、`no-referrer` 和 `noindex` 等头，降低缓存、引用来源和搜索索引泄漏。

## 安全边界

- Server 能看到分享 ID、账号归属、范围、有效期、创建/撤销时间和密文大小，但没有 URL fragment 中的解密 key。
- 任何拿到完整链接的人都可能读取内容；撤销链接不能收回接收者已经复制或保存的明文。
- 分享链接不应通过会主动展开、记录或重写 fragment 的不可信中间服务转发。
- 公开分享是明确的用户动作，不改变会话和文件的默认私有状态。

主要实现位于：

- `packages/agenthub-app/sources/utils/externalShareCapability.ts`
- `packages/agenthub-app/sources/sync/publishExternalShare.ts`
- `packages/agenthub-app/sources/-external-share`
- `packages/agenthub-server/sources/app/api/routes/externalSharesRoutes.ts`
