# `auth login` 跨平台 daemon 自动接入设计

## 目标

用户在新机器上只需运行一次 `agenthub auth login`。认证成功后，CLI 自动完成当前操作系统的 daemon 自启动安装、立即启动和健康检查，不再要求用户手动执行 `schtasks`、`systemctl` 或 `launchctl`。

## 行为

- 已安装且健康的 daemon 保持运行，不中断现有会话。
- 自启动服务不存在时，调用当前平台的安装器创建服务。
- 自启动服务存在但 daemon 未运行时，通过对应服务管理器立即启动：Windows 使用计划任务，Linux 使用 systemd user service，macOS 使用 LaunchAgent。
- 启动后沿用 daemon 健康检查；未就绪时保留可复制的诊断命令。
- 重复运行 `auth login` 必须幂等，不重复创建并行 daemon。

## 权限错误

安装或启动服务失败时，结果必须保留真实错误，并按平台显示获取或修复权限的方法：

- Windows：提示以管理员身份重新打开 PowerShell，再运行 `agenthub auth login`；同时提供计划任务状态检查命令。
- Linux：用户服务保持无 root 运行；linger 权限不足时提示使用 `sudo loginctl enable-linger "$USER"`，systemd user service 失败时提供用户服务状态检查命令。
- macOS：提示修复 `~/Library/LaunchAgents` 的当前用户写权限，并重新运行登录；同时提供 LaunchAgent 状态检查命令。

权限失败不能伪装成接入成功。认证本身仍然保留，用户修复权限后再次运行同一个 `agenthub auth login` 即可继续接入，无需强制重新认证。

## 测试

集中补充 `postLoginSetup` 单元测试，覆盖三个平台的服务启动命令、已安装服务的幂等行为、安装/启动权限错误提示以及成功健康检查。随后运行 CLI 定向测试、类型检查、构建和完整 unit 回归。
