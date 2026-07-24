import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { install } from './install'
import { ensureDaemonRunning } from './ensureDaemonRunning'
import { isDaemonRunningCurrentlyInstalledAgentHubVersion } from './controlClient'
import { getLinuxSystemdServiceFile } from './linux/install'

export type PostLoginSetupStatus = 'ready' | 'completed' | 'action-required'

export interface PostLoginSetupStep {
  id: 'autostart' | 'linger' | 'daemon'
  title: string
  status: PostLoginSetupStatus
  detail: string
}

export interface PostLoginManualAction {
  purpose: string
  command: string
}

export interface PostLoginSetupResult {
  ready: boolean
  steps: PostLoginSetupStep[]
  manualActions: PostLoginManualAction[]
}

export interface PostLoginSetupDependencies {
  platform: NodeJS.Platform
  homeDir: string
  username: string
  userId: string
  pathExists: (path: string) => boolean
  runCommand: (command: string, args: string[]) => string
  installDaemonService: () => Promise<void>
  ensureDaemonRunning: () => Promise<void>
  isCurrentDaemonRunning: () => Promise<boolean>
  daemonReadyAttempts: number
  sleep: (milliseconds: number) => Promise<void>
}

interface ServiceDescriptor {
  label: string
  isInstalled: () => boolean
  start: () => void
  startCommand: string
  verifyCommand: string
}

function defaultRunCommand(command: string, args: string[]): string {
  return execFileSync(command, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function defaultDependencies(): PostLoginSetupDependencies {
  return {
    platform: process.platform,
    homeDir: homedir(),
    username: process.env.USER || process.env.USERNAME || '',
    userId: typeof process.getuid === 'function' ? String(process.getuid()) : '',
    pathExists: existsSync,
    runCommand: defaultRunCommand,
    installDaemonService: install,
    ensureDaemonRunning,
    isCurrentDaemonRunning: isDaemonRunningCurrentlyInstalledAgentHubVersion,
    daemonReadyAttempts: 30,
    sleep: milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)),
  }
}

function getServiceDescriptor(dependencies: PostLoginSetupDependencies): ServiceDescriptor | null {
  if (dependencies.platform === 'linux') {
    return {
      label: 'systemd --user',
      isInstalled: () => dependencies.pathExists(
        getLinuxSystemdServiceFile(dependencies.homeDir),
      ),
      start: () => {
        dependencies.runCommand('systemctl', ['--user', 'restart', 'agenthub-daemon.service'])
      },
      startCommand: 'systemctl --user restart agenthub-daemon.service',
      verifyCommand: 'systemctl --user status agenthub-daemon.service --no-pager',
    }
  }

  if (dependencies.platform === 'darwin') {
    return {
      label: 'macOS LaunchAgent',
      isInstalled: () => dependencies.pathExists(join(
        dependencies.homeDir,
        'Library',
        'LaunchAgents',
        'com.agenthub-cli.daemon.plist',
      )),
      start: () => {
        dependencies.runCommand('launchctl', [
          'kickstart',
          '-k',
          `gui/${dependencies.userId}/com.agenthub-cli.daemon`,
        ])
      },
      startCommand: 'launchctl kickstart gui/$(id -u)/com.agenthub-cli.daemon',
      verifyCommand: 'launchctl print gui/$(id -u)/com.agenthub-cli.daemon',
    }
  }

  if (dependencies.platform === 'win32') {
    return {
      label: 'Windows 登录计划任务',
      isInstalled: () => {
        try {
          dependencies.runCommand('schtasks', ['/query', '/tn', 'AgentHubDaemon'])
          return true
        } catch {
          return false
        }
      },
      start: () => {
        dependencies.runCommand('schtasks', ['/run', '/tn', 'AgentHubDaemon'])
      },
      startCommand: 'schtasks /run /tn "AgentHubDaemon"',
      verifyCommand: 'schtasks /query /tn "AgentHubDaemon" /v /fo list',
    }
  }

  return null
}

function addManualAction(
  actions: PostLoginManualAction[],
  action: PostLoginManualAction,
): void {
  if (!actions.some(existing => existing.command === action.command)) {
    actions.push(action)
  }
}

function addPlatformPermissionActions(
  dependencies: PostLoginSetupDependencies,
  actions: PostLoginManualAction[],
): void {
  if (dependencies.platform === 'win32') {
    addManualAction(actions, {
      purpose: '获取创建或运行 Windows 计划任务所需权限',
      command: 'Start-Process powershell -Verb RunAs',
    })
    addManualAction(actions, {
      purpose: '在管理员 PowerShell 中继续自动接入',
      command: 'agenthub auth login',
    })
    return
  }

  if (dependencies.platform === 'linux') {
    addManualAction(actions, {
      purpose: '允许当前 Linux 用户在注销后运行用户服务',
      command: 'sudo loginctl enable-linger "$USER"',
    })
    addManualAction(actions, {
      purpose: '刷新并启动当前用户的 AgentHub 服务',
      command: 'systemctl --user daemon-reload && systemctl --user restart agenthub-daemon.service',
    })
    return
  }

  if (dependencies.platform === 'darwin') {
    addManualAction(actions, {
      purpose: '修复当前用户的 LaunchAgents 目录权限',
      command: 'mkdir -p "$HOME/Library/LaunchAgents" && chmod u+rwx "$HOME/Library/LaunchAgents"',
    })
    addManualAction(actions, {
      purpose: '修复权限后继续自动接入',
      command: 'agenthub auth login',
    })
  }
}

async function waitForCurrentDaemon(
  dependencies: PostLoginSetupDependencies,
): Promise<boolean> {
  for (let attempt = 0; attempt < dependencies.daemonReadyAttempts; attempt += 1) {
    try {
      if (await dependencies.isCurrentDaemonRunning()) return true
    } catch {
      // daemon 仍在启动或尚未写入状态文件
    }
    if (attempt + 1 < dependencies.daemonReadyAttempts) {
      await dependencies.sleep(500)
    }
  }
  return false
}

function isLinuxLingerEnabled(dependencies: PostLoginSetupDependencies): boolean {
  if (!dependencies.username) return false
  const output = dependencies.runCommand('loginctl', [
    'show-user',
    dependencies.username,
    '-p',
    'Linger',
    '--value',
  ])
  return output.trim().toLowerCase() === 'yes'
}

function configureLinuxLinger(
  dependencies: PostLoginSetupDependencies,
  steps: PostLoginSetupStep[],
  manualActions: PostLoginManualAction[],
): void {
  try {
    if (isLinuxLingerEnabled(dependencies)) {
      steps.push({
        id: 'linger',
        title: 'Linux 注销后持续运行',
        status: 'ready',
        detail: 'linger 已启用',
      })
      return
    }

    dependencies.runCommand('loginctl', [
      'enable-linger',
      dependencies.username,
    ])

    if (!isLinuxLingerEnabled(dependencies)) {
      throw new Error('linger 状态未生效')
    }

    steps.push({
      id: 'linger',
      title: 'Linux 注销后持续运行',
      status: 'completed',
      detail: '已自动启用 linger',
    })
  } catch {
    steps.push({
      id: 'linger',
      title: 'Linux 注销后持续运行',
      status: 'action-required',
      detail: '当前权限无法启用 linger；用户登录期间仍可正常运行',
    })
    addManualAction(manualActions, {
      purpose: '允许 daemon 在注销后继续运行并随系统启动',
      command: 'sudo loginctl enable-linger "$USER"',
    })
    addManualAction(manualActions, {
      purpose: '确认 linger 已启用',
      command: 'loginctl show-user "$USER" -p Linger',
    })
  }
}

export async function setupDaemonAfterLogin(
  dependencies: PostLoginSetupDependencies = defaultDependencies(),
): Promise<PostLoginSetupResult> {
  const steps: PostLoginSetupStep[] = []
  const manualActions: PostLoginManualAction[] = []
  const service = getServiceDescriptor(dependencies)
  let serviceInstalled = false
  let serviceInstalledDuringSetup = false

  if (!service) {
    steps.push({
      id: 'autostart',
      title: '用户级自启动服务',
      status: 'action-required',
      detail: `当前平台 ${dependencies.platform} 暂不支持自动安装`,
    })
  } else {
    try {
      serviceInstalled = service.isInstalled()
    } catch {
      serviceInstalled = false
    }

    if (serviceInstalled) {
      steps.push({
        id: 'autostart',
        title: '用户级自启动服务',
        status: 'ready',
        detail: `${service.label} 已安装`,
      })
    } else {
      try {
        await dependencies.installDaemonService()
        serviceInstalled = true
        serviceInstalledDuringSetup = true
        steps.push({
          id: 'autostart',
          title: '用户级自启动服务',
          status: 'completed',
          detail: `${service.label} 已安装并启用`,
        })
      } catch (error) {
        steps.push({
          id: 'autostart',
          title: '用户级自启动服务',
          status: 'action-required',
          detail: `自动安装失败：${error instanceof Error ? error.message : '未知错误'}`,
        })
        addManualAction(manualActions, {
          purpose: '重新安装用户级 daemon 自启动服务',
          command: 'agenthub daemon install',
        })
        addManualAction(manualActions, {
          purpose: `检查 ${service.label} 状态`,
          command: service.verifyCommand,
        })
        addPlatformPermissionActions(dependencies, manualActions)
      }
    }
  }

  if (dependencies.platform === 'linux') {
    configureLinuxLinger(dependencies, steps, manualActions)
  }

  let daemonReady = await waitForCurrentDaemon({
    ...dependencies,
    daemonReadyAttempts: 1,
  })
  let serviceStartError: unknown
  let ensureError: unknown

  if (!daemonReady && service && serviceInstalled) {
    try {
      service.start()
      daemonReady = await waitForCurrentDaemon(dependencies)
    } catch (error) {
      serviceStartError = error
      addPlatformPermissionActions(dependencies, manualActions)
    }
  }

  // An installed definition may still point at a removed Node/NVM version or
  // an older CLI bundle. Repair it once, then start through the OS supervisor.
  if (
    !daemonReady
    && !serviceStartError
    && service
    && serviceInstalled
    && !serviceInstalledDuringSetup
  ) {
    try {
      await dependencies.installDaemonService()
      serviceInstalledDuringSetup = true
      service.start()
      daemonReady = await waitForCurrentDaemon(dependencies)

      const autostartStep = steps.find(step => step.id === 'autostart')
      if (autostartStep) {
        autostartStep.status = 'completed'
        autostartStep.detail = `${service.label} 已修复并启用`
      }
    } catch (error) {
      serviceStartError = error
      addPlatformPermissionActions(dependencies, manualActions)
    }
  }

  // Unsupported platforms and failed service installations retain the
  // detached-process fallback. Installed services remain the sole owner.
  try {
    if (!daemonReady && (!service || !serviceInstalled)) {
      await dependencies.ensureDaemonRunning()
    }
  } catch (error) {
    ensureError = error
  }

  if (!daemonReady && !serviceStartError) {
    daemonReady = await waitForCurrentDaemon({
      ...dependencies,
      daemonReadyAttempts: 1,
    })
  }

  if (daemonReady) {
    steps.push({
      id: 'daemon',
      title: 'AgentHub daemon',
      status: 'ready',
      detail: '当前 CLI 版本 daemon 已运行',
    })
  } else {
    steps.push({
      id: 'daemon',
      title: 'AgentHub daemon',
      status: 'action-required',
      detail: serviceStartError instanceof Error
        ? `自动启动失败：${serviceStartError.message}`
        : ensureError instanceof Error
        ? `自动启动失败：${ensureError.message}`
        : '自动启动后仍未通过当前版本健康检查',
    })

    if (service && serviceInstalled) {
      addManualAction(manualActions, {
        purpose: `通过 ${service.label} 重新启动 daemon`,
        command: service.startCommand,
      })
      addManualAction(manualActions, {
        purpose: `检查 ${service.label} 状态`,
        command: service.verifyCommand,
      })
    } else {
      addManualAction(manualActions, {
        purpose: '临时启动 AgentHub daemon',
        command: 'agenthub daemon start',
      })
    }

    addManualAction(manualActions, {
      purpose: '确认 daemon 已运行',
      command: 'agenthub daemon status',
    })
  }

  return {
    ready: steps.every(step => step.status !== 'action-required'),
    steps,
    manualActions,
  }
}

export function formatPostLoginSetupResult(
  result: PostLoginSetupResult,
  machine: { hostname: string; machineId: string },
): string {
  const lines = [
    '',
    '正在完成本机接入检查',
    `  主机：${machine.hostname}`,
    `  Machine ID：${machine.machineId}`,
    '',
  ]

  for (const step of result.steps) {
    const icon = step.status === 'action-required' ? '⚠' : '✓'
    lines.push(`${icon} ${step.title}：${step.detail}`)
  }

  if (result.ready) {
    lines.push('', '✓ 本机后台接入已完成，可以从手机端管理此机器。')
    return lines.join('\n')
  }

  lines.push('', '下一步（按需复制执行）：')
  result.manualActions.forEach((action, index) => {
    lines.push(`  ${index + 1}. ${action.purpose}`)
    lines.push(`     ${action.command}`)
  })
  lines.push('', '完成后可运行 `agenthub auth status` 再次检查。')
  return lines.join('\n')
}
