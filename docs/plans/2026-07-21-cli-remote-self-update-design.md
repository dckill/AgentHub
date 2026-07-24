# CLI 远程自更新设计

## 目标

AgentHub 客户端的设备列表显示设备 CLI 是否需要更新；设备详情允许用户发起更新。请求沿既有端到端加密的 machine RPC 到达 daemon，由 daemon 在设备本机查询 npm registry、安装指定的精确版本并发布更新状态。现有 runner 不随 daemon 重启被终止。

## 数据与控制流

daemon 将 `CliUpdateStatus` 写入加密的 `daemonState.cliUpdate`：包含当前版本、最新版、目标版本、阶段、检查时间、是否可更新及错误。客户端只依据该状态展示，不直接信任或调用 npm registry。新增 `check-cli-update`、`update-cli`、`rollback-cli` 三个 machine RPC；协议继续经过 `@artsum/agenthub-wire` 的 Zod 校验和现有机器密钥加密。

更新执行复用当前 npm 全局发布方式：只允许 registry 返回的精确 SemVer，使用无 shell 的子进程参数调用包管理器，并关闭 lifecycle scripts；CLI 首次启动已有 bundled-tools 原子恢复。更新期间 daemon 暂停 bundle replacement 判定，安装完成后恢复现有 bundle 指纹校验、候选 smoke、备份回滚与 systemd `Restart=on-failure` 重启。更新记录写入 `$AGENTHUB_HOME_DIR/update/state.json`，用于显示失败和执行版本回滚。

## 客户端体验

设备列表仅显示“可更新”状态徽标，不增加批量危险操作。详情页展示当前版、最新版和更新阶段；设备在线、RPC 可用且 daemon 报告 `canUpdate` 时允许点击。更新请求被接受后按钮进入 busy，随后以 daemonState 的实时变化为准；重启短暂离线属于正常阶段。旧 CLI 没有新 RPC 时展示一次性手动升级提示。

## 验证边界

集中测试覆盖 SemVer/registry 响应、精确版本安装、并发锁、失败状态与回滚记录、wire 请求响应、加密 RPC 注册、App 状态模型、systemd runner 保留契约。阶段末运行 CLI 与 wire 定向测试、CLI typecheck/build、App 测试/typecheck/production build，并按进程治理规范复查 systemd daemon、runner PID、daemon list 与 8443 连接。
