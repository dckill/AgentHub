# 本地开发环境

本仓库使用 pnpm workspace。根目录脚本负责启动 CLI、Web、server、环境模板和辅助服务。

## 前置要求

- Node.js 20 或更高版本。
- pnpm 10.11.0；根 `package.json` 的 `packageManager` 已固定该版本。
- 本地 shell 建议能直接执行 `pnpm`。如果使用 corepack，应先启用并准备 pnpm；环境 manager 会优先复用 PATH 中的 pnpm 10.11.0，找不到时才 fallback 到 `npx -y pnpm@10.11.0`。

## 安装

```bash
pnpm install
```

## 常用脚本

| 命令 | 说明 |
| --- | --- |
| `pnpm --filter @artsum/agenthub build` | 构建 AgentHub CLI。 |
| `pnpm web` | 启动 AgentHub App Web。 |
| `pnpm codium` | 启动 Codium Electron 开发模式。 |
| `pnpm app-logs` | 启动 App/CLI 调试日志服务。 |
| `pnpm --filter agenthub-server dev` | 启动后端开发服务。 |
| `pnpm --filter agenthub-server standalone:dev` | 用 PGlite 启动 standalone 开发服务，默认端口 13017。 |
| `pnpm --filter @artsum/agenthub build` | 构建 CLI 包。 |
| `pnpm --filter agenthub-app typecheck` | App 类型检查。 |
| `pnpm --filter @artsum/agenthub-wire test` | 构建并测试 wire 包。 |
| `pnpm check` | 根级检查：格式空白检查、递归 typecheck 和 guardrail 测试。 |

## Android APK 本机打包

当前工作机已经具备 Android 本机构建环境，但这些路径不一定在普通 SSH shell 中自动导出，因此直接执行 `./gradlew` 可能会误报缺少 SDK 或触发 Gradle 自动下载 JDK。

本机已验证路径：

| 项 | 路径 / 版本 |
| --- | --- |
| JDK | JDK 17；通过 `JAVA_HOME` 指向本机安装目录 |
| Android SDK | 通过 `ANDROID_HOME` 指向本机 SDK 目录 |
| Android build-tools | `36.0.0` |
| Android compileSdk / targetSdk | `36` |
| Gradle wrapper | `packages/agenthub-app/android/gradlew`，Gradle `9.0.0` |
| pnpm | 固定 `10.11.0`；当前环境没有全局 `pnpm` 时使用 `npx -y pnpm@10.11.0` |

生成可安装测试的个人 arm64 compact `preview` release APK：

```bash
npx -y pnpm@10.11.0 --filter agenthub-app android:apk:arm64
```

该脚本会调用根目录 `scripts/build-android.sh`，完成 Gradle 构建后自动把 APK 归档到根目录 `artifacts/`。交付给手机安装测试时使用归档产物，不直接使用 Gradle 内部输出目录。

如果后续需要把当前 Android 改动通过 OTA 推给已安装设备，不在这里单独维护命令，统一按 [deployment.md](./deployment.md) 的“Android OTA 标准流程”执行。

产物命名规范：

```bash
artifacts/agenthub-production-arm64-YYYYMMDD-HHMM.apk
artifacts/agenthub-production-arm64-latest.apk
```

其中带时间戳的文件用于留档，`latest` 始终指向最近一次同类构建的可安装 APK 副本。

核心 Gradle 构建步骤等价于：

```bash
cd packages/agenthub-app/android
APP_ENV=production \
EXPO_PUBLIC_AGENTHUB_SERVER_URL=https://agenthub.yzsd.asia:8443 \
JAVA_HOME=/path/to/jdk-17 \
ANDROID_HOME=/path/to/android-sdk \
./gradlew :app:assembleRelease \
  -PreactNativeArchitectures=arm64-v8a \
  -Pexpo.useLegacyPackaging=true \
  --no-configuration-cache \
  -Dorg.gradle.java.installations.auto-download=false
```

关键说明：

- `APP_ENV=production` 对应应用名 `AgentHub` 和包名 `com.artsum.agenthub`。
- `EXPO_PUBLIC_AGENTHUB_SERVER_URL` 显式写入公网服务端地址；代码默认值也是 `https://agenthub.yzsd.asia:8443`。
- `EXPO_PUBLIC_AGENTHUB_SHARE_ORIGIN` 仅用于已验证 HTTPS origin 的 Native 外部 E2EE 分享；authenticated Web 使用当前同源 HTTPS，不应把本地自签名代理地址写入 production export。
- `-PreactNativeArchitectures=arm64-v8a` 只打包 Android arm64 真机架构，去掉 `armeabi-v7a`、`x86`、`x86_64`。
- `-Pexpo.useLegacyPackaging=true` 压缩 native `.so` 文件，降低 APK 体积；代价是安装时需要解压 native 库。
- `JAVA_HOME` 指向已有 JDK 17，避免 Gradle 通过 `foojay-resolver-convention 0.5.0` 自动下载 toolchain。该 resolver 在 Gradle 9 下可能因 `JvmVendorSpec IBM_SEMERU` 枚举兼容性失败。
- `ANDROID_HOME` 指向已有 SDK，避免 Gradle 报 `SDK location not found`。
- `--no-configuration-cache` 用于避开当前 Expo/RN Gradle 配置期调用 Node 与 Gradle configuration cache 的兼容性问题。

本轮实际包体积：

| 构建方式 | APK 大小 | native ABI |
| --- | ---: | --- |
| 通用四 ABI release | 195 MB | `armeabi-v7a`、`arm64-v8a`、`x86`、`x86_64` |
| arm64-only release | 83 MB | `arm64-v8a` |
| arm64-only compact release | 58 MB | `arm64-v8a` |

当前还保留的主要大项：

- `@shopify/react-native-skia`：当前原生 QRCode 组件依赖它，arm64 解压后 `librnskia.so` 约 11 MB；如果后续改成纯 `react-native-svg` 或普通 View 绘制二维码，可以继续删掉 Skia。
- `expo-camera`：账号和终端绑定二维码扫描依赖它；扫码相关 native 体积中 `libbarhopper_v3.so` 是主要来源之一。
- `expo-dev-client` / dev menu：当前 `preview` 原生工程仍会包含 dev launcher/menu 模块；如果后续确认不需要 Expo dev client 能力，可以单独移除依赖和插件链，再做一轮回归测试。

Gradle 内部 APK 产物：

```bash
packages/agenthub-app/android/app/build/outputs/apk/release/app-release.apk
```

该文件只作为构建中间产物；正式交付和安装测试统一使用 `artifacts/` 下的时间戳 APK 或 `latest` APK。

基础校验：

```bash
"$ANDROID_HOME/build-tools/36.0.0/aapt" dump badging <apk>
"$ANDROID_HOME/build-tools/36.0.0/apksigner" verify --print-certs <apk>
unzip -p <apk> assets/index.android.bundle | grep -aF -o 'https://agenthub.yzsd.asia:8443'
```

## 环境模板

根目录 `env:*` 脚本由 `environments/environments.ts` 驱动：

```bash
pnpm env:new
pnpm env:list
pnpm env:use
pnpm env:current
pnpm env:up
pnpm env:down
pnpm env:server
pnpm env:web
pnpm env:ios
pnpm env:android
pnpm env:cli
pnpm env:seed
pnpm env:tailscale
```

这些命令用于创建隔离开发环境、切换当前环境、启动 server/web/mobile/CLI，并使用 `environments/data` 下的项目模板进行调试。

### authenticated Web 隔离环境

需要真实登录态的协议、状态机或构建验证时，可使用 authenticated Web 隔离环境。它不是浏览器截图门槛。

推荐命令：

```bash
npx -y pnpm@10.11.0 run env:up:authenticated
```

该命令会自动：

- 创建或切换到隔离开发环境
- 启动本地 server 和 Expo Web
- 基于该环境的本地 `access.key` seed 一个开发测试账号
- 输出 `Open: http://localhost:<port>/?dev_token=...&dev_secret=...`

`Open` 地址用于显式请求的人工排查；日常验证使用 `pnpm web:contract:test`、组件测试、类型检查和 production build，不需要打开该地址。

环境 manager 会为 Expo Web 默认注入 `EXPO_UNSTABLE_HEADLESS=true`，避免 Linux 主机尝试启动不可用的 Chrome SUID sandbox；冷启动等待预算默认 120 秒，可通过 `AGENTHUB_ENV_WEB_STARTUP_TIMEOUT_MS`（不少于 1000）覆盖。Web 凭证只在页面内存中使用，刷新或关闭页面后需要重新打开新的 `Open` 地址登录；不要把该地址或其参数写入 issue、截图或持久化日志。

环境 Server/Web 由环境专用 service supervisor 托管 stdout/stderr。PID 文件记录 supervisor 进程组 owner，`env:down` 会按同一进程组关闭实际服务。每个服务默认最多保留 `stdout.log` 与 19 个 archive，每片不超过 1MiB（总上限 20MiB）；写盘前会脱敏认证 query、Bearer、token、API key 与 secret。超过 64KiB 且没有换行的单行会写入固定截断标记，避免日志或内存无界增长。不要绕过 supervisor 直接把长期服务输出重定向到环境日志文件。

验证结束后必须清理隔离环境；若用户明确要求而启动过浏览器，也必须清理浏览器进程：

```bash
pnpm env:down
pnpm env:remove <environment-name>
```

约束：

- UI/视觉/交互默认使用无浏览器自动化契约，不新增截图、录屏或人工点击步骤。
- 只有用户明确要求人工视觉验收或平台商店强制需要截图时，才临时打开 authenticated Web。
- `/restore` 扫码只用于明确的恢复链路验收。

## 测试策略

各包自带测试脚本：

```bash
pnpm --filter @artsum/agenthub test:unit
pnpm --filter @artsum/agenthub test:integration
pnpm --filter agenthub-server test
pnpm --filter agenthub-agent test
pnpm --filter @artsum/agenthub-wire test
pnpm --filter codium test
```

改动代码时优先运行最小相关测试，再逐步扩大范围。仅改文档时通常不需要运行完整测试，但应检查文档链接和文件名。

## 本机 CLI 与 daemon 更新

开发机如果已经安装 `agenthub-daemon.service`，优先让 systemd 管理 daemon，不要长期混用手动 daemon：

```bash
systemctl --user stop agenthub-daemon.service
npx -y pnpm@10.11.0 --filter @artsum/agenthub build
systemctl --user start agenthub-daemon.service
systemctl --user status agenthub-daemon.service --no-pager
agenthub daemon status
agenthub daemon list
```

service 文件必须包含 `KillMode=process`。这样 systemd 停止或重启 daemon 时只处理 daemon 主进程，不会把 daemon 启动的 Codex/Claude 会话一起杀掉。`packages/agenthub-cli` 的 bundle 被替换时，systemd 托管 daemon 会退出为 failure 并交给 `Restart=on-failure` 拉起新版；非 systemd 启动的 daemon 才使用自 spawn 路径。

如果由智能体执行这套流程，必须先保存当前 `agenthub daemon list` 与相关 `ps` 输出，重启后再次检查二者一致；发现 Codex app-server 已退出、`stdin not writable` 或 runner 脱离当前 daemon 管理时，应先让对应 AgentHub 会话归档退出，再清理残留进程。不要留下多个 daemon 或长期运行的手动 daemon。

如果没有安装自启动服务，才使用：

```bash
npx -y pnpm@10.11.0 --filter @artsum/agenthub cli:install
agenthub daemon stop
agenthub daemon start
```

## 调试日志

`packages/agenthub-app-logs` 提供简单日志聚合服务：

```bash
pnpm app-logs
```

CLI/App 中与远程日志相关的变量包括 `DANGEROUSLY_LOG_TO_SERVER_FOR_AI_AUTO_DEBUGGING`、`AGENTHUB_DEBUG_LOG_SECRET` 和 `EXPO_PUBLIC_LOG_SERVER_URL`。这些仅用于开发调试，不应在生产暴露敏感日志。
