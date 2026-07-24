# CLI 登录后自动接入设计

## 目标

用户通过手机扫码完成 `agenthub auth login` 后，CLI 立即检查并尽可能自动完成本机接入：注册本机标识、安装用户级自启动服务、启动 daemon、验证当前版本 daemon 可用。无法自动完成的权限或平台步骤必须输出可复制命令、用途和复查方式，不要求用户另行查阅文档。

该流程同样适用于“已经登录”的机器。再次执行登录命令应成为安全的修复入口，而不是在发现凭据后直接返回。

## Phase 0：允许复用的现有 API

- `packages/agenthub-cli/src/ui/auth.ts`：`authAndSetupMachineIfNeeded()` 保存凭据并创建或保留 machine ID。
- `packages/agenthub-cli/src/daemon/install.ts`：`install()` 按平台安装 systemd user service、LaunchAgent 或 Windows 登录计划任务。
- `packages/agenthub-cli/src/daemon/ensureDaemonRunning.ts`：`ensureDaemonRunning()` 启动 daemon 并等待本地控制端就绪。
- `packages/agenthub-cli/src/daemon/controlClient.ts`：`isDaemonRunningCurrentlyInstalledAgentHubVersion()` 验证当前 CLI 版本 daemon。
- `packages/agenthub-cli/src/daemon/linux/install.ts`：`getLinuxSystemdServiceFile()` 提供 Linux unit 的唯一标准路径。

约束：macOS 和 Windows 当前没有统一 supervisor/status API；本次不伪造这些 API，也不改 daemon 核心循环。平台服务“是否安装”通过标准文件或系统命令检查，安装和 daemon 拉起仍复用上述入口。

## Phase 1：集中失败测试

新增 daemon 接入编排单测，覆盖：未安装时自动安装、已经安装时不重装、安装失败后保留可操作命令、Linux linger 自动处理与权限提示、daemon 未就绪时的平台恢复命令、macOS/Windows 状态差异。

新增 auth 命令单测，覆盖：新登录、已登录、machine ID 修复、强制登录以及 `--no-daemon-setup`。重点锁定“已登录也执行修复”和“接入失败不误报认证失败”。

验证：新增测试在实现前失败；测试使用依赖注入和 Vitest mocks，不调用真实 systemd、launchctl 或 schtasks。

## Phase 2：结构化接入编排

新增 `daemon/postLoginSetup.ts`：

1. 检查平台自启动服务是否存在。
2. 缺失时调用现有 `install()` 自动安装；存在时不做破坏性重装。
3. Linux 检查 linger；能自动开启则开启，权限不足则给出 `sudo loginctl enable-linger "$USER"` 与复查命令。
4. 调用 `ensureDaemonRunning()`，再以当前版本健康检查确认结果。
5. 返回步骤状态与人工操作清单；单个步骤失败不阻断后续可安全步骤。

反模式保护：不重复 stop/disable 已安装服务；不在 systemd 已安装时启动第二个 detached owner；不输出凭据、token 或控制端信息；不扩展 Claude Code/Codex 之外的 provider。

## Phase 3：登录命令接线与输出

`auth login` 在新认证、已有认证和 machine ID 修复后统一执行接入编排。输出包含每项检查结果、机器名和 machine ID；全部完成时明确说明机器已具备后台接入条件，部分失败时按“目的 + 命令”展示下一步。

保留 `--no-daemon-setup`，用于容器、临时环境或用户明确不希望安装系统服务的场景。该参数只跳过接入，不影响认证。

## Phase 4：验证与进程治理

依次运行新增定向测试、CLI unit 测试、类型检查和 production build。构建前记录 daemon/runner 现场并停止 systemd daemon，构建后重启服务，检查 systemd 状态、daemon 状态、会话列表、进程对应关系以及 8443 websocket。最后运行 GitNexus `detect_changes()`，确认影响只落在认证与 daemon 接入预期范围。
