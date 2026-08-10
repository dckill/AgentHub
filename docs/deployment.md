# 部署

AgentHub Server 可按两种方式部署：常规 Node/tsx 服务，或独立 `agenthub-server` 发行包。生产建议使用外部 Postgres、Redis 和对象存储；小型自托管可使用 standalone + PGlite。

## 常规服务

```bash
pnpm install
pnpm --filter agenthub-server generate
pnpm --filter agenthub-server migrate
pnpm --filter agenthub-server start
```

开发模式：

```bash
pnpm --filter agenthub-server dev
# 或使用 PGlite standalone 开发入口
pnpm --filter agenthub-server standalone:dev
```

单机公网部署推荐使用生产环境文件，不要复用 `.env.dev`：

```bash
cp packages/agenthub-server/.env.production.example packages/agenthub-server/.env.production
# 编辑 .env.production，设置 PUBLIC_URL、AGENTHUB_ALLOWED_ORIGINS、AGENTHUB_MASTER_SECRET
pnpm --filter agenthub-server standalone:prod
```

`standalone:prod` 会先执行 PGlite migration，再以 `NODE_ENV=production` 启动服务。默认监听 `0.0.0.0:13017`，适合被同机或内网反向代理转发。

## 独立服务端

```bash
pnpm --filter agenthub-server build:standalone
./packages/agenthub-server/dist/agenthub-server migrate
./packages/agenthub-server/dist/agenthub-server serve
```

standalone 默认使用：

- `DATA_DIR=./data`
- `PGLITE_DIR=$DATA_DIR/pglite`
- `PORT=13017`

如设置 `DATABASE_URL`，可使用外部 Postgres。

## Docker 镜像

仓库根目录包含三个 Dockerfile：

| 文件 | 用途 |
| --- | --- |
| `Dockerfile` | standalone server，PGlite + 本地文件存储，适合单机自托管。 |
| `Dockerfile.server` | 常规 server runtime（`runner` target）及独立数据库迁移镜像（`migration` target），适合外部 Postgres/Redis/S3 部署。 |
| `Dockerfile.webapp` | Expo Web 静态导出 + Nginx。 |

镜像构建上下文由 `.dockerignore` 排除 `.worktrees`、`.gitnexus`、`artifacts`、`environments`、依赖树和本地构建产物，避免把本地状态或敏感文件送入 builder。Web 镜像的依赖安装使用 `--ignore-scripts`，随后只显式执行仓库补丁和 App Web postinstall；这避免构建 Web 时编译无关的 `node-pty` 原生模块。当前 Web 构建不接收分析或订阅服务参数；不要把服务端 secret 放入 Docker build arg 或前端 bundle。runtime 非 root、只读根文件系统、临时可写挂载和 HTTP smoke 已在本地隔离容器验证；生产发布仍需完成 registry 漏洞/SBOM、签名和真实 rollout/rollback 验收。

三个 runtime 均使用非特权用户：服务端镜像为 UID/GID 10001 的 `agenthub`，Web Nginx 为 `nginx`，Web 容器监听 `8080`（反向代理或端口映射可使用 `80:8080`），不依赖非 root 绑定低端口。
三个 Dockerfile 的外部基础镜像均固定为 sha256 digest；更新基础镜像时必须显式更新 digest、重跑 builder/runtime smoke，并同步记录漏洞扫描与 SBOM。

`Dockerfile.server` 的默认 `runner` target使用独立的 `packages/agenthub-server-runtime/pnpm-lock.yaml`，只包含编译Server实际导入的生产依赖；在线镜像不包含Prisma CLI、`schema.prisma`、TSX、TypeScript或测试/前端构建工具。数据库迁移必须使用同一Dockerfile的 `migration` target：

```bash
docker build --target runner -t agenthub-server:local -f Dockerfile.server .
docker build --target migration -t agenthub-server-migration:local -f Dockerfile.server .
```

本地Kubernetes脚本会加载两个镜像，并只用migration镜像执行`prisma migrate deploy`。受保护CI也会分别构建、推送和签名`agenthub-server`与`agenthub-server-migration`。生产发布器要求两个exact digest都通过同一protected-master identity验签，等待稳定版`agenthub-secrets` ExternalSecret Ready，创建fresh hardened migration Job并等待Complete、保存私有日志后，才允许更新在线Deployment。迁移失败会删除Job并停止发布。该源码编排已经自动化，但在取得真实protected GitLab/Vault/registry/cluster artifact前仍不能宣称生产发布闭环完成。

Kubernetes 生产清单 `packages/agenthub-server/deploy/base/agenthub.yaml` 使用故障关闭的全零 Server digest 占位符，不能直接上线，也不要用字符串替换或可变 tag 绕过。发布流水线必须把已经构建、扫描并推送的精确镜像引用交给 renderer：

```bash
node scripts/renderKubernetesRelease.cjs \
  --component server \
  --image registry.example.com/agenthub/agenthub-server@sha256:<64位非零小写摘要> \
  --output /tmp/agenthub-production.yaml
```

renderer 只接受以 `/agenthub-server@sha256:<digest>` 结尾的小写 registry 路径，要求清单中恰有一个全零占位符，并在写出前重新解析和验证 Deployment；输出通过同目录 staging + rename 原子替换。不要把真实 secret 写入渲染文件，`ExternalSecret` 仍由目标集群的 external-secrets operator 解析。

Web 生产清单 `packages/agenthub-app/deploy/agenthub-app.yaml` 同样使用故障关闭的全零 digest 占位符，必须通过同一个 renderer 的 Web 组件路径生成：

```bash
node scripts/renderKubernetesRelease.cjs \
  --component web \
  --image registry.example.com/agenthub/agenthub-app@sha256:<64位非零小写摘要> \
  --output /tmp/agenthub-web-production.yaml
```

Web renderer 只接受精确的 `/agenthub-app@sha256:<digest>` 引用，并验证 UID/GID 101、只读根文件系统、`8080` 命名端口与探针、受限临时挂载、`IfNotPresent` 和滚动更新 `maxUnavailable: 0`。生产部署仍应从受保护 registry 拉取已经扫描并签名的同一 digest；不要把可变 tag 或全零占位符直接提交给集群。

目标 Kubernetes 版本需支持 `admissionregistration.k8s.io/v1` 的 `ValidatingAdmissionPolicy`。先安装并等待策略的 `observedGeneration` 追上 `generation`，再提交渲染后的清单：

```bash
kubectl apply -f packages/agenthub-server/deploy/policies/require-immutable-agenthub-images.yaml

policy=agenthub-require-immutable-images
until [ "$(kubectl get validatingadmissionpolicy "$policy" -o jsonpath='{.metadata.generation}')" = \
        "$(kubectl get validatingadmissionpolicy "$policy" -o jsonpath='{.status.observedGeneration}')" ]; do
  sleep 1
done

kubectl apply --server-side --dry-run=server -f /tmp/agenthub-production.yaml
kubectl apply --server-side -f /tmp/agenthub-production.yaml
```

该策略以 `Fail`/`Deny` 覆盖名为 `agenthub-*` 的 Deployment/StatefulSet 创建和更新：所有普通、初始化及临时容器必须使用非零 sha256 digest，并满足禁用 ServiceAccount token、非 root、RuntimeDefault seccomp、禁止提权/privileged 和 drop ALL capabilities。Server 使用 UID/GID 10001；Redis 与 exporter 也已固定上游 digest，并分别使用明确的非 root UID。`overlays/local` 会有意把 Server 改为 `agenthub-server:local`，只用于隔离开发集群，不应安装生产 admission policy。

内置 CEL 策略只能证明引用不可变和安全上下文。生产还必须安装 Sigstore Policy Controller，并通过 `packages/agenthub-server/deploy/policies/require-signed-agenthub-images.yaml` 对 Server、Server migration和Web的精确 registry digest路径执行 protected-master keyless、Fulcio、Rekor和Cosign v3 bundle准入。策略模板必须使用`scripts/renderSignedImagePolicy.cjs`渲染，不允许用正则扩大certificate identity/issuer。

Registry 凭据由 External Secrets 稳定版 `external-secrets.io/v1` 清单 `packages/agenthub-server/deploy/agenthub-registry-external-secret.yaml` 生成。目标 namespace 必须预先存在 `SecretStore/vault-backend`，其 `/agenthub-registry` 的 `dockerconfigjson` property 必须生成类型为 `kubernetes.io/dockerconfigjson` 的 `Secret/agenthub-registry`；仓库和命令参数中不得出现真实 registry 密码。

受保护发布统一使用以下入口；不带 `--apply` 时只验证签名、策略/ExternalSecret schema、namespace opt-in 和 workload server-side dry-run，受保护人工 deploy job 才能添加 `--apply`：

```bash
node scripts/runSignedKubernetesRelease.cjs \
  --component web \
  --image registry.example.com/agenthub/agenthub-app@sha256:<digest> \
  --registry-prefix registry.example.com/agenthub \
  --certificate-identity https://gitlab.example.com/group/project//.gitlab-ci.yml@refs/heads/master \
  --certificate-issuer https://gitlab.example.com \
  --namespace agenthub-production \
  --manifest-output /tmp/agenthub-web-production.yaml \
  --policy-output /tmp/agenthub-signature-policy.yaml \
  --report-output /tmp/agenthub-web-release.json \
  --timeout 120s
```

`--apply` 路径会先等待两个签名策略 Ready，再等待 `ExternalSecret/agenthub-registry` Ready 并验证生成 Secret 类型，然后才进行 workload dry-run、apply 和 rollout status。更新失败时必须恢复到精确旧 digest；首次部署失败则删除失败 Deployment。Cosign v3/Policy Controller 必须使用 bundle 签名格式，不能因本地 legacy key 测试或上游兼容性问题关闭 Rekor/keyless 生产保护。

服务端代码默认监听 `13017`；如果容器或平台设置了 `PORT`，以环境变量为准。

## 必要配置

| 变量 | 说明 |
| --- | --- |
| `AGENTHUB_MASTER_SECRET` | 服务端认证/加密相关 master secret，生产必须设置并妥善保管。 |
| `PORT` | HTTP 端口，默认 `13017`。 |
| `PUBLIC_URL` | 公网 HTTPS 根地址，用于生成本地文件访问 URL；应与反代域名一致，不要以 `/` 结尾。 |
| `AGENTHUB_SERVER_URL` | CLI/agent 使用的服务端地址；自托管时建议与 `PUBLIC_URL` 一致。 |
| `DATABASE_URL` | Postgres 连接串；不设置时 standalone 可使用 PGlite。 |
| `DB_PROVIDER` | 数据库 provider，standalone serve 默认设为 `pglite`。 |
| `PGLITE_DIR` | PGlite 数据目录。 |
| `REDIS_URL` | 可选，启用 Socket.IO Redis Streams 多副本广播。 |
| `ALLOWED_ORIGINS` / `AGENTHUB_ALLOWED_ORIGINS` | CORS 与 Socket.IO 允许的浏览器来源，多个来源用英文逗号分隔；生产环境未配置时会拒绝带 `Origin` 的浏览器请求，CLI 等无 `Origin` 的非浏览器请求仍允许。 |
| `METRICS_ENABLED` / `METRICS_PORT` | Prometheus 监控配置。 |
| `LOCAL_FILE_SIGNING_SECRET` | 本地文件存储 URL 签名 secret；不设置时使用 `AGENTHUB_MASTER_SECRET`。 |
| `ALLOW_UNSIGNED_LOCAL_FILES` | 仅建议本地开发使用；设为 `true` 时允许无签名访问 `/files/*`。生产默认必须使用签名 URL。 |

## OnePanel / Nginx 反向代理

服务端 HTTP 和 Socket.IO 使用同一个后端端口，默认是 `127.0.0.1:13017`。Socket.IO 路径固定为 `/v1/updates`，反代必须允许 WebSocket upgrade 和长连接。

OnePanel 站点反向代理建议：

- 目标 URL：`http://127.0.0.1:13017`，如果服务端在另一台内网机器上则改为对应内网 IP。
- 开启 WebSocket 支持。
- SSL 证书绑定到公网域名，客户端统一使用 `https://agenthub.yzsd.asia:8443`。
- 如存在独立 location 规则，确认 `/v1/updates` 没有被静态站点、缓存或其他代理规则截断。

可放入 OnePanel 站点的 Nginx 自定义配置：

```nginx
location / {
    proxy_pass http://127.0.0.1:13017;
    proxy_http_version 1.1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
    proxy_connect_timeout 60s;
    proxy_buffering off;
}
```

公网验证：

```bash
curl -i https://agenthub.yzsd.asia:8443/
curl -i https://agenthub.yzsd.asia:8443/v1/account/profile
node scripts/verify-public-server.mjs https://agenthub.yzsd.asia:8443
```

预期结果：根路由返回 `200` 和 `Welcome to AgentHub Server!`；未带 token 的 profile 返回 `401`；Socket.IO 验证应到达服务端并返回认证错误。如果 Socket.IO 超时或返回 `websocket error`，优先检查 OnePanel 的 WebSocket 开关、`Upgrade`/`Connection` 头、超时配置和 `/v1/updates` 路由。

## 调试日志端点

`DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING` 会启用远程调试日志端点。该能力只建议临时用于排障；启用后请求必须满足以下任一条件：

- 携带有效 `Authorization: Bearer <token>`；
- 或携带 `X-AgentHub-Debug-Secret`，且值等于 `AGENTHUB_DEBUG_LOG_SECRET`。

## 本地文件存储

未配置 `S3_HOST` 时，服务端使用本地文件存储。服务端生成的 `/files/*` URL 会自动附带短期签名 token；生产环境默认拒绝无签名访问。

## S3/MinIO

对象存储相关变量：

| 变量 | 说明 |
| --- | --- |
| `S3_HOST` | S3/MinIO host。 |
| `S3_PORT` | 端口。 |
| `S3_USE_SSL` | 是否使用 SSL。 |
| `S3_ACCESS_KEY` / `S3_SECRET_KEY` | 访问密钥。 |
| `S3_BUCKET` | bucket 名称。 |
| `S3_REGION` | region。 |
| `S3_PUBLIC_URL` | 文件公开访问 URL。 |

本地开发可用：

```bash
pnpm --filter agenthub-server s3
pnpm --filter agenthub-server s3:init
pnpm --filter agenthub-server s3:down
```

## 多副本部署

多副本需要配置同一个 `DATABASE_URL`、`AGENTHUB_MASTER_SECRET` 和 `REDIS_URL`。Redis Streams adapter 负责 Socket.IO 跨副本广播；客户端重连仍会 REST 补拉完整状态。

## 客户端地址

- CLI 使用 `AGENTHUB_SERVER_URL=https://agenthub.yzsd.asia:8443`。
- App/Web 构建使用 `EXPO_PUBLIC_AGENTHUB_SERVER_URL=https://agenthub.yzsd.asia:8443`。
- Web 外部 E2EE 分享默认使用运行时同源 HTTPS；Native 只有在显式设置无路径的 `EXPO_PUBLIC_AGENTHUB_SHARE_ORIGIN=https://<verified-origin>` 后才创建外部链接。正式启用前必须验证该 origin 的证书、Apple Universal Links 与 Android App Links association，密钥只能位于 URL fragment。
- 开发日志服务可配置 `EXPO_PUBLIC_LOG_SERVER_URL`。

Android 本地 APK 构建示例：

```bash
EXPO_PUBLIC_AGENTHUB_SERVER_URL=https://agenthub.yzsd.asia:8443 \
APP_ENV=development \
BUILD_TYPE=debug \
scripts/build-android.sh --prebuild
```

生产包可改为 `APP_ENV=production BUILD_TYPE=release`。如果不传 `EXPO_PUBLIC_AGENTHUB_SERVER_URL`，APK 会使用源码默认服务端地址，不适合自托管验证。不要为了启用分享而把未通过证书和 association 验证的域名写入 `EXPO_PUBLIC_AGENTHUB_SHARE_ORIGIN`；缺少该变量时 Native 分享入口会安全地保持不可用。

## Android OTA 标准流程

当前 Android OTA 基于 Expo EAS Update，适用于已经安装了 OTA-enabled `production` APK 的设备。后续当需要“推送当前成功 OTA”时，默认按下面流程执行。

发布前检查：

```bash
npx -y pnpm@10.11.0 --filter agenthub-app typecheck
cd packages/agenthub-app
npx eas-cli@latest whoami
```

要求：

- 需要确认当前 EAS 账号已登录。
- `typecheck` 必须通过。
- `eas update` 必须在 `packages/agenthub-app` 目录执行；在仓库根目录执行会因为找不到 EAS project 配置而失败。
- 当前 `runtimeVersion` 为 `1`；只有安装了相同 runtime 的 APK，设备才能收到该 OTA。
- 常规 OTA 禁止使用 `eas workflow:run`。该命令会先压缩上传整个仓库；标准流程必须在本机导出并通过 `eas update` 直传 OTA 产物。
- production Android 已启用 SDK 55 bsdiff。安装过带 `ENABLE_BSDIFF_PATCH_SUPPORT=true` 的 APK 后，客户端会优先下载更小的 JS bundle 补丁；旧 APK 仍可接收普通 OTA，但需要下一次原生包更新后才能使用 bundle 差分。

Android production OTA 发布命令：

```bash
cd packages/agenthub-app
EAS_SKIP_AUTO_FINGERPRINT=1 \
APP_ENV=production \
NODE_ENV=production \
EXPO_PUBLIC_AGENTHUB_SERVER_URL=https://agenthub.yzsd.asia:8443 \
npx eas-cli@latest update \
  --channel production \
  --environment production \
  --platform android \
  --message "<本次 OTA 说明>" \
  --non-interactive
```

也可以在仓库根目录执行等价的固定入口；`OTA_MESSAGE` 应填写本次发布说明：

```bash
OTA_MESSAGE="<本次 OTA 说明>" \
npx -y pnpm@10.11.0 --filter agenthub-app ota:production
```

标准说明：

- `EAS_SKIP_AUTO_FINGERPRINT=1` 用于避开当前环境偶发的 fingerprint 上传超时。
- 默认只发 `android`，不要顺手发 `all`；当前 Android 已验证稳定，`all` 更慢，也更容易把未准备好的平台一起带上。
- 本地导出只上传 OTA bundle、manifest 和发生变化的资源，不上传仓库压缩包。设备端会复用缓存资源；是否下发 bsdiff 由 EAS 根据补丁收益自动决定。
- `--message` 使用本次改动的简短说明，例如 `android ota update status banner`。

发布成功后应记录这些返回值：

- `Branch`
- `Runtime version`
- `Update group ID`
- `Android update ID`
- `EAS Dashboard` 链接

设备侧验证：

1. 设备已安装最新的 OTA-enabled Android APK。
2. 冷启动 App，或把 App 切到后台再回到前台一次。
3. 自动检查会静默执行；如果发现更新，会看到“下载中”或“新版本已准备好”提示。
4. 也可以在设置页点击“检查更新”手动触发。

常见问题：

- 浏览器停在 `http://localhost:45045/auth/callback?...` 没反应：先运行 `npx eas-cli@latest whoami` 检查是否其实已经登录；已登录就继续发布。
- 命令提示 `EAS project not configured`：说明当前目录不对，切到 `packages/agenthub-app` 再执行。
- 设备收不到更新：优先核对安装包是否为 OTA-enabled `production` APK、`runtimeVersion` 是否匹配、发布 channel 是否为 `production`。
