# AgentHub 服务端密钥隔离与轮换

本文档只记录操作步骤、版本号和验证结果，禁止记录密钥明文、编码值、哈希或可用于离线猜测的片段。

## 密钥用途

生产环境必须分别生成且不得复用：

- `AGENTHUB_DATA_ENCRYPTION_KEYS`：服务端托管凭据加密密钥环。
- `AGENTHUB_TOKEN_KEYS`：Bearer Token 签名密钥环。
- `LOCAL_FILE_SIGNING_SECRET`：仅在不使用 S3 时签发本地文件 URL。
- S3、数据库、第三方 API 凭据不得与上述任何值相同。

每个密钥环以正整数版本标识，`*_KEY_VERSION` 指定 active key。旧版本只用于读取/验签，不再签发或加密新内容。

## 首次安全切换

1. 在 Vault 或等价外部秘密管理器中分别生成至少 32 字节的高熵随机值，写入 `/agenthub-data-encryption`、`/agenthub-token-signing` 和按需使用的 `/agenthub-files`。
2. 数据密钥环的版本 `1` 必须临时使用现有 `AGENTHUB_MASTER_SECRET` 的值，新增独立版本 `2` 并将 active version 设为 `2`。这样历史托管凭据仍可读取，新写入只使用独立密钥。
3. Token 密钥直接建立独立 active version。部署新的持久 Token 生命周期时，旧格式 Token 会失效，所有客户端需重新登录。
4. 本地文件签名使用独立值；切换后旧的临时签名 URL 自然失效，不影响底层文件。
5. 部署后检查 Server readiness、登录、托管凭据读取/新建、文件下载和 Token 吊销。
6. 轮换所有曾进入 Git 历史的实际凭据。轮换完成前，删除当前文件不能视为风险关闭。

## 后续零停机轮换

1. 在对应 JSON 密钥环中加入新版本，不删除旧版本。
2. 将 active version 切到新版本并滚动部署。
3. 验证旧数据可读、新数据可写；Token 场景同时验证旧 Token 可验签、新 Token 的 `keyVersion` 已更新。
4. 数据密钥需要先完成后台重加密或确认所有旧密文已被改写，才能删除旧版本。
5. Token 旧版本必须保留到该版本所有 Token 过期或被持久吊销。

## 不含秘密的证据记录

每次轮换只记录：操作时间、操作者、密钥用途、旧/新版本号、Vault 变更事件 ID、部署 pipeline ID、Pod revision、验证命令退出码和回滚结果。建议验证：

```bash
kubectl rollout status deployment/agenthub-server
kubectl get pods -l app=agenthub-server
kubectl logs deployment/agenthub-server --since=10m | rg -i 'missing|required|decrypt|token verification failed'
```

不得执行会输出 Secret 内容的 `kubectl get secret -o yaml/json`。只验证键名存在时，应在受控脚本内输出布尔结果或键名列表。

## Secret Detection

GitLab pipeline 引入官方 `Jobs/Secret-Detection.gitlab-ci.yml`。Merge Request 与 `master` pipeline 执行增量扫描，定时 pipeline 执行历史扫描；required `secret-policy` 作业额外阻止具体 `.env` 和 Kubernetes Secret manifest 被追踪。首次启用后必须审阅历史扫描报告，并将每个真实命中关联到轮换证据或经审查的测试夹具豁免。
