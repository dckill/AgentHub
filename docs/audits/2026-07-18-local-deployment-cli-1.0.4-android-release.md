# AgentHub 2026-07-18 本机部署、CLI 1.0.4 与 Android 交付报告

## 1. 交付结论

本批未改变 AgentHub 的产品哲学和双智能体边界。当前交付完成了以下结果：

- 本机 Server 已运行当前源码，补执行 5 个数据库迁移，并完成数据加密、Token 签名和本地文件签名三类生产密钥的用途隔离。
- 本机全局 CLI 已更新为 `@artsum/agenthub@1.0.4`；同版本已发布到 npm，`latest` 已指向 `1.0.4`。
- systemd daemon 使用的仓库 bundle 已构建为 1.0.4。因 Token 安全切换按设计废止旧凭据，daemon 需用户完成一次 `agenthub auth login --force` 后再恢复常驻；两个既有 runner 在切换过程中未被 SIGKILL。
- Android production arm64 APK 已在补入 Version 19 changelog 后重新构建并通过签名、ZIP、ABI、包名和 SDK 自动验证。
- GitNexus 已刷新到当前基线，未提交变更检测结果为 0 个受影响执行流程、低风险。

## 2. Server 本机部署

### 2.1 服务启动路径修正

当前仓库已经采用隔离依赖布局，根目录不再提供 `node_modules/.bin/dotenv`。旧的本机 systemd unit 因继续引用根目录路径而得到 `203/EXEC`。本批完成：

- 将本机 `agenthub-server.service` 的 `dotenv` 与 `tsx` 路径切换到 `packages/agenthub-server/node_modules/.bin/`。
- 同步更新 `DEPLOY_AND_DEV.md`，避免下一次安装重新写回失效路径。
- 执行 `systemctl --user daemon-reload` 后重新启动服务。

### 2.2 密钥迁移

当前生产配置强制要求独立的版本化密钥环。迁移遵循 `docs/security/server-key-rotation.md`：

- 数据加密密钥环保留旧 master 为只读兼容版本 1，新生成独立版本 2 并作为 active key，避免历史托管密文失读。
- Token 签名密钥建立独立版本 1；旧 Token 因缺少新生命周期字段而按设计失效。
- 本地文件 URL 使用第三个独立高熵签名密钥。
- `.env.production` 权限保持 `0600`；文档、Git diff 和证据均不记录任何密钥值、哈希片段或 npm token。

### 2.3 结果

- PGlite 成功补执行 5 个迁移，随后复核为无待执行迁移。
- `http://127.0.0.1:13017/health` 返回 200/`status=ok`。
- `https://agenthub.yzsd.asia:8443/health` 返回 200/`status=ok`。
- `agenthub-server.service` 为 `active/running`，`NRestarts=0`。

## 3. CLI 1.0.4 发布与本机安装

### 3.1 自动验证

- `@artsum/agenthub test:unit`：107 files / 709 tests / 0 failed，退出码 0；该命令同时完成 TypeScript 检查和 production bundle 构建。
- release metadata：8/8，退出码 0，`issues=[]`。
- 根 `check`：7 个 workspace 类型检查、Server 协议 5/5、Wire v4 同步 2/2、diff check 均通过，退出码 0。
- 发布 tarball：50 个文件，约 105.2 MB，unpacked 112,324,009 bytes；包含 dist/bin、12 个固定平台工具归档和许可证，不包含开发机 unpacked 工具目录。
- 本地 tarball SHA-256：`0f0f0c6fa491b429737f17d9d6d47c3f113c9a7292f0e6630c3cba1bc43e5fb7`。

### 3.2 npm 结果

- 发布身份：已通过 npm 身份验证；证据不记录认证 token。
- 发布版本：`@artsum/agenthub@1.0.4`。
- dist-tag：`latest=1.0.4`。
- registry shasum：`d57698aea1aae481c2058096c11e8ff2cf5cc99d`。
- registry integrity：`sha512-mPoefX+aqA5LwpHO3ku46Lok2yOUrFFerFXRfFwEHq5wao5ajaJW/RkbYSM6GOmM7jfpvtQtvK9KaeJgDzjMXA==`。

最初三次 PUT 因当前网络对 105.2 MB 请求的默认超时得到 `FETCH_ERROR`，registry 未产生半发布版本。将单次 npm fetch timeout 提高到 30 分钟后发布成功。临时 `0600` npmrc 已删除，认证终端已退出。

### 3.3 其他机器更新

```bash
npm install -g @artsum/agenthub@latest
agenthub --version
agenthub auth login --force
```

预期版本输出为 `1.0.4`。由于本次服务端 Token 生命周期切换是安全断点，已有机器也必须重新配对一次。

## 4. daemon 与 runner 状态

CLI 构建前记录到唯一 systemd daemon 版本 1.0.3、两个 daemon 管理的 Codex runner。按 `KillMode=process` 停止 daemon 后，runner PID 保持存活；CLI 1.0.4 构建及全局安装均已完成。

新 daemon 首次启动成功恢复两个持久会话，但访问 Server 时得到预期 401：旧 Token 已被新 Token 生命周期拒绝。当前服务保持停止，避免无意义重试。用户完成以下步骤后可恢复：

```bash
agenthub auth login --force
systemctl --user start agenthub-daemon.service
agenthub daemon status
agenthub daemon list
```

人工复核项：确认只有一个 systemd daemon，两个仍需保留的 runner 被收养，`daemon list` 与进程一致，活跃 runner/daemon 均恢复到 `agenthub.yzsd.asia:8443` 的 ESTAB 连接。该认证动作需要用户持有已登录 App，不能由发布脚本绕过。

## 5. Android production arm64

最终推荐产物：

- `artifacts/agenthub-production-arm64-20260718-2227.apk`
- `artifacts/agenthub-production-arm64-latest.apk`

两者内容相同：

- SHA-256：`9425e0edd4df9a85be9a09bb19029e686351371f4cb22e9819f1df7a0fa258cf`
- 大小：57,909,638 bytes
- mode：`0600`
- 包名：`com.artsum.agenthub`
- 版本：`1.0.0`
- minSdk / targetSdk：24 / 36
- native ABI：仅 `arm64-v8a`
- APK Signature Scheme v2：通过
- ZIP 完整性与必需条目：通过
- production Server：`https://agenthub.yzsd.asia:8443`

本机无连接的 Android 设备，因此安装、启动、系统权限和推送属于非阻塞人工验收。未使用浏览器、截图或图形化验证。

## 6. 发布说明与可追溯性

- 新增 App Version 19 中英文 changelog，并重新生成按 locale 拆分的内置 JSON。
- changelog 契约先得到 3 个版本漂移失败，再更新到 Version 19 后 7/7 通过。
- APK 在 changelog 生成后重新构建，避免交付包继续携带 Version 18 快照。
- 机器可读证据：`docs/audits/evidence/2026-07-18-release/219-local-server-cli-1.0.4-npm-and-android-delivery.json`。

## 7. 当前唯一需用户完成的动作

1. 在 Android 设备安装最终 APK，并使用根密钥重新登录。
2. 在本机运行 `agenthub auth login --force`，用 App 扫描配对二维码。
3. 启动并复核 daemon；如果把结果交回本任务，可继续记录最终 runner 收养和 8443 连接证据。

这三步不阻塞源码、Server、npm、APK、文档和 Git 交付，但决定本机 daemon 能否重新获得有效 Token 并恢复远程控制。
