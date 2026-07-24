import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  formatPostLoginSetupResult,
  setupDaemonAfterLogin,
  type PostLoginSetupDependencies,
} from './postLoginSetup'

function createDependencies(
  overrides: Partial<PostLoginSetupDependencies> = {},
): PostLoginSetupDependencies {
  return {
    platform: 'linux',
    homeDir: '/home/tester',
    username: 'tester',
    userId: '1000',
    pathExists: vi.fn(() => true),
    runCommand: vi.fn((command: string, args: string[]) => {
      if (command === 'loginctl' && args.includes('show-user')) return 'yes\n'
      return ''
    }),
    installDaemonService: vi.fn().mockResolvedValue(undefined),
    ensureDaemonRunning: vi.fn().mockResolvedValue(undefined),
    isCurrentDaemonRunning: vi.fn().mockResolvedValue(true),
    daemonReadyAttempts: 1,
    sleep: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

describe('setupDaemonAfterLogin', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('installs a missing user service and verifies the daemon', async () => {
    const dependencies = createDependencies({
      pathExists: vi.fn(() => false),
      isCurrentDaemonRunning: vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(dependencies.installDaemonService).toHaveBeenCalledTimes(1)
    expect(dependencies.runCommand).toHaveBeenCalledWith(
      'systemctl',
      ['--user', 'restart', 'agenthub-daemon.service'],
    )
    expect(dependencies.ensureDaemonRunning).not.toHaveBeenCalled()
    expect(result.ready).toBe(true)
    expect(result.steps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'autostart', status: 'completed' }),
      expect.objectContaining({ id: 'daemon', status: 'ready' }),
    ]))
    expect(result.manualActions).toEqual([])
  })

  it('does not destructively reinstall an existing service', async () => {
    const dependencies = createDependencies()

    const result = await setupDaemonAfterLogin(dependencies)

    expect(dependencies.installDaemonService).not.toHaveBeenCalled()
    expect(dependencies.runCommand).not.toHaveBeenCalledWith(
      'systemctl',
      ['--user', 'restart', 'agenthub-daemon.service'],
    )
    expect(result.steps).toContainEqual(expect.objectContaining({
      id: 'autostart',
      status: 'ready',
    }))
  })

  it('keeps checking the daemon and returns copyable recovery commands when installation fails', async () => {
    const dependencies = createDependencies({
      pathExists: vi.fn(() => false),
      installDaemonService: vi.fn().mockRejectedValue(new Error('systemctl unavailable')),
      isCurrentDaemonRunning: vi.fn().mockResolvedValue(false),
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(dependencies.ensureDaemonRunning).toHaveBeenCalledTimes(1)
    expect(result.ready).toBe(false)
    expect(result.manualActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        command: 'agenthub daemon install',
        purpose: expect.stringContaining('自启动'),
      }),
    ]))
  })

  it('reports the exact linger command when Linux permissions block automatic setup', async () => {
    const runCommand = vi.fn((command: string, args: string[]) => {
      if (command === 'loginctl' && args.includes('show-user')) return 'no\n'
      if (command === 'loginctl' && args.includes('enable-linger')) {
        throw new Error('access denied')
      }
      return ''
    })
    const dependencies = createDependencies({ runCommand })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(result.ready).toBe(false)
    expect(result.manualActions).toEqual(expect.arrayContaining([
      {
        purpose: expect.stringContaining('注销后'),
        command: 'sudo loginctl enable-linger "$USER"',
      },
      {
        purpose: expect.stringContaining('确认 linger'),
        command: 'loginctl show-user "$USER" -p Linger',
      },
    ]))
  })

  it('returns platform-specific start and verification commands when the daemon is not ready', async () => {
    const dependencies = createDependencies({
      isCurrentDaemonRunning: vi.fn().mockResolvedValue(false),
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(result.ready).toBe(false)
    expect(result.manualActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        command: 'systemctl --user restart agenthub-daemon.service',
      }),
      expect.objectContaining({ command: 'agenthub daemon status' }),
    ]))
  })

  it('starts an installed Windows scheduled task automatically when the daemon is not ready', async () => {
    const runCommand = vi.fn(() => '')
    const dependencies = createDependencies({
      platform: 'win32',
      runCommand,
      daemonReadyAttempts: 1,
      isCurrentDaemonRunning: vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(runCommand).toHaveBeenCalledWith('schtasks', ['/query', '/tn', 'AgentHubDaemon'])
    expect(runCommand).toHaveBeenCalledWith('schtasks', ['/run', '/tn', 'AgentHubDaemon'])
    expect(dependencies.installDaemonService).not.toHaveBeenCalled()
    expect(result.ready).toBe(true)
    expect(result.manualActions).toEqual([])
  })

  it('repairs a stale Windows scheduled task when starting it does not produce a healthy daemon', async () => {
    const runCommand = vi.fn((_command: string, _args: string[]) => '')
    const dependencies = createDependencies({
      platform: 'win32',
      runCommand,
      daemonReadyAttempts: 1,
      isCurrentDaemonRunning: vi.fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(dependencies.installDaemonService).toHaveBeenCalledTimes(1)
    expect(runCommand).toHaveBeenCalledWith('schtasks', ['/run', '/tn', 'AgentHubDaemon'])
    expect(runCommand.mock.calls.filter(([command, args]) => (
      command === 'schtasks' && args[0] === '/run'
    ))).toHaveLength(2)
    expect(result.steps).toContainEqual(expect.objectContaining({
      id: 'autostart',
      status: 'completed',
      detail: expect.stringContaining('已修复'),
    }))
    expect(result.ready).toBe(true)
  })

  it('shows Windows elevation guidance when the scheduled task cannot be started', async () => {
    const runCommand = vi.fn((command: string, args: string[]) => {
      if (command === 'schtasks' && args[0] === '/run') throw new Error('Access is denied')
      return ''
    })
    const dependencies = createDependencies({
      platform: 'win32',
      runCommand,
      isCurrentDaemonRunning: vi.fn().mockResolvedValue(false),
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(result.ready).toBe(false)
    expect(result.steps).toContainEqual(expect.objectContaining({
      id: 'daemon',
      status: 'action-required',
      detail: expect.stringContaining('Access is denied'),
    }))
    expect(result.manualActions).toEqual(expect.arrayContaining([
      {
        purpose: '获取创建或运行 Windows 计划任务所需权限',
        command: 'Start-Process powershell -Verb RunAs',
      },
      {
        purpose: '在管理员 PowerShell 中继续自动接入',
        command: 'agenthub auth login',
      },
    ]))
  })

  it('shows macOS user permission repair guidance when LaunchAgent startup is denied', async () => {
    const pathExists = vi.fn((path: string) => path === '/Users/tester/Library/LaunchAgents/com.agenthub-cli.daemon.plist')
    const runCommand = vi.fn((command: string) => {
      if (command === 'launchctl') throw new Error('Operation not permitted')
      return ''
    })
    const dependencies = createDependencies({
      platform: 'darwin',
      homeDir: '/Users/tester',
      pathExists,
      runCommand,
      isCurrentDaemonRunning: vi.fn().mockResolvedValue(false),
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(result.ready).toBe(false)
    expect(result.manualActions).toEqual(expect.arrayContaining([
      {
        purpose: '修复当前用户的 LaunchAgents 目录权限',
        command: 'mkdir -p "$HOME/Library/LaunchAgents" && chmod u+rwx "$HOME/Library/LaunchAgents"',
      },
      {
        purpose: '修复权限后继续自动接入',
        command: 'agenthub auth login',
      },
    ]))
  })

  it('shows Linux user-service permission guidance when systemd startup is denied', async () => {
    const runCommand = vi.fn((command: string, args: string[]) => {
      if (command === 'loginctl' && args.includes('show-user')) return 'yes\n'
      if (command === 'systemctl') throw new Error('Permission denied')
      return ''
    })
    const dependencies = createDependencies({
      runCommand,
      isCurrentDaemonRunning: vi.fn().mockResolvedValue(false),
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(result.ready).toBe(false)
    expect(result.manualActions).toEqual(expect.arrayContaining([
      {
        purpose: '允许当前 Linux 用户在注销后运行用户服务',
        command: 'sudo loginctl enable-linger "$USER"',
      },
      {
        purpose: '刷新并启动当前用户的 AgentHub 服务',
        command: 'systemctl --user daemon-reload && systemctl --user restart agenthub-daemon.service',
      },
    ]))
  })

  it('recognizes an existing macOS LaunchAgent without reinstalling it', async () => {
    const pathExists = vi.fn((path: string) => path === '/Users/tester/Library/LaunchAgents/com.agenthub-cli.daemon.plist')
    const dependencies = createDependencies({
      platform: 'darwin',
      homeDir: '/Users/tester',
      pathExists,
    })

    const result = await setupDaemonAfterLogin(dependencies)

    expect(pathExists).toHaveBeenCalledWith('/Users/tester/Library/LaunchAgents/com.agenthub-cli.daemon.plist')
    expect(dependencies.installDaemonService).not.toHaveBeenCalled()
    expect(result.steps).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'linger' }),
    ]))
    expect(result.ready).toBe(true)
  })
})

describe('formatPostLoginSetupResult', () => {
  it('renders an inline completion summary without requiring documentation', () => {
    const output = formatPostLoginSetupResult({
      ready: false,
      steps: [
        { id: 'autostart', title: '用户级自启动服务', status: 'ready', detail: 'systemd --user 已安装' },
        { id: 'daemon', title: 'AgentHub daemon', status: 'action-required', detail: '尚未就绪' },
      ],
      manualActions: [
        { purpose: '启动 daemon', command: 'agenthub daemon start' },
        { purpose: '检查状态', command: 'agenthub daemon status' },
      ],
    }, {
      hostname: 'workstation',
      machineId: 'machine-123',
    })

    expect(output).toContain('workstation')
    expect(output).toContain('machine-123')
    expect(output).toContain('下一步')
    expect(output).toContain('启动 daemon')
    expect(output).toContain('agenthub daemon start')
    expect(output).toContain('agenthub daemon status')
  })
})
