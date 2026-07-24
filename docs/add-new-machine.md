# 新电脑加入 AgentHub Server

本文说明如何把一台新电脑或服务器加入当前 AgentHub 账号，让它出现在 App / Web 的“设备”页面，并允许远程创建、恢复和管理 Claude Code / Codex 会话。

## 适用场景

- 给新电脑安装 AgentHub CLI。
- 把当前运行 CLI 的电脑注册为账号下的一台设备。
- 在 Linux 服务器上让 daemon 常驻运行。
- 排查 App 里设备不在线、无法远程启动会话的问题。

默认服务端为：

```text
https://agenthub.yzsd.asia:8443
```

CLI 默认已经指向这个地址。只有使用自托管服务端或临时测试环境时，才需要手动设置 `AGENTHUB_SERVER_URL`。

## 1. 安装前准备

新电脑需要：

- Node.js 20 或更高版本。
- 能访问 `https://agenthub.yzsd.asia:8443`。
- 能访问 npm registry。
- 已安装你实际要运行的受支持代理：Claude Code 或 Codex CLI。

检查 Node：

```bash
node -v
npm -v
```

安装 AgentHub CLI：

```bash
npm install -g @artsum/agenthub@latest
```

确认安装版本：

```bash
agenthub --version
which agenthub
```

当前仓库对应的 CLI 版本为 `1.0.4`；安装发布包时不得低于该版本。

## 2. 登录并注册这台电脑

在新电脑上运行：

```bash
agenthub auth login
```

终端会显示二维码和一个 `agenthub://terminal?...` 链接。

在手机 App 或 Web 端使用同一个 AgentHub 账号登录，然后扫码或打开该链接完成授权。授权成功后，CLI 会在本机写入凭据并生成机器 ID。

检查状态：

```bash
agenthub auth status
```

正常状态应包含：

- `Authenticated`
- `Machine registered`
- 当前主机名
- 本机数据目录 `~/.agenthub`

如果这台电脑之前绑定过旧账号，使用强制重新绑定：

```bash
agenthub auth login --force
```

该命令会停止 daemon、清除旧凭据和旧 machine ID，然后重新扫码注册。

## 3. 启动 daemon

daemon 是这台设备保持在线、接受 App / Web 远程创建会话请求的后台进程。

临时启动：

```bash
agenthub daemon start
agenthub daemon status
agenthub daemon list
```

Linux 服务器建议安装用户级 systemd 常驻服务：

```bash
agenthub daemon install
systemctl --user status agenthub-daemon.service --no-pager
agenthub daemon status
```

`agenthub daemon install` 会创建：

```text
~/.config/systemd/user/agenthub-daemon.service
```

服务中必须保留：

```ini
KillMode=process
Restart=on-failure
```

`KillMode=process` 用来避免 daemon 重启时误杀正在运行的 Claude / Codex 会话。

如果是长期无人登录的 Linux 服务器，还需要确认 linger：

```bash
loginctl show-user "$USER" | grep Linger
```

如果不是 `Linger=yes`，可尝试：

```bash
loginctl enable-linger "$USER"
```

如果没有权限，让服务器管理员执行。

## 4. 在 App / Web 中确认设备

登录同一个 AgentHub 账号后，进入“设备”页面。

正常情况下应看到：

- 新电脑的主机名。
- 在线状态。
- 可用工作目录。
- daemon / RPC 能力。

如果看不到设备，先在新电脑上执行：

```bash
agenthub auth status
agenthub daemon status
agenthub doctor
```

再检查服务端连接：

```bash
curl -I https://agenthub.yzsd.asia:8443
```

## 5. 启动一个会话验证

在新电脑终端直接验证：

```bash
agenthub codex
```

或：

```bash
agenthub claude
```

启动后，App / Web 的会话列表应该能看到新会话。

也可以从 App / Web 选择这台设备，指定工作目录，然后远程新建会话。目标目录必须在新电脑上真实存在，并且当前用户有读写权限。

## 6. 自托管或临时服务端

如果不用默认线上服务端，需要在登录和 daemon 启动前设置：

```bash
export AGENTHUB_SERVER_URL=https://your-server.example.com:8443
agenthub auth login
agenthub daemon start
```

Linux systemd 常驻服务要让环境变量进入 service。推荐使用 override：

```bash
systemctl --user edit agenthub-daemon.service
```

写入：

```ini
[Service]
Environment=AGENTHUB_SERVER_URL=https://your-server.example.com:8443
```

然后重启：

```bash
systemctl --user daemon-reload
systemctl --user restart agenthub-daemon.service
agenthub daemon status
```

默认线上服务端不需要这一步。

## 7. 升级 CLI

所有服务器统一升级：

```bash
npm install -g @artsum/agenthub@latest
agenthub --version
```

Linux systemd daemon 建议升级后重启：

```bash
systemctl --user restart agenthub-daemon.service
systemctl --user status agenthub-daemon.service --no-pager
agenthub daemon status
```

如果机器上有正在运行的会话，优先等待会话结束再升级。

## 8. 常见问题

### App 里看不到新设备

执行：

```bash
agenthub auth status
agenthub daemon status
agenthub doctor
```

重点看：

- 是否已认证。
- 是否有 machine ID。
- daemon 是否运行。
- `AGENTHUB_SERVER_URL` 是否指向正确服务端。

### 扫码后一直等待

确认：

- 手机 App / Web 登录的是目标账号。
- CLI 和 App / Web 指向同一个服务端。
- 新电脑能访问 `https://agenthub.yzsd.asia:8443`。

必要时重新绑定：

```bash
agenthub auth login --force
```

### systemd 显示 inactive，但 daemon status 显示运行

说明可能有手动 daemon 残留。恢复到标准 systemd 托管：

```bash
agenthub daemon stop
systemctl --user daemon-reload
systemctl --user restart agenthub-daemon.service
agenthub daemon status
```

### 远程创建会话失败

检查目标机器：

```bash
agenthub daemon list
pwd
ls -la <目标目录>
```

确认：

- daemon 在线。
- 目标路径存在。
- 当前用户有权限。
- 本机已安装对应代理：`codex` 或 `claude`。

### 彻底移除本机绑定

```bash
agenthub auth logout
agenthub daemon uninstall
```

如需清理本机全部 AgentHub 数据：

```bash
rm -rf ~/.agenthub
```

该操作会删除本机凭据、machine ID、日志和本地状态；之后必须重新扫码登录。
