import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mockLoggerDebug: vi.fn(),
  mockIsDaemonRunningCurrentlyInstalledAgentHubVersion: vi.fn(),
  mockCheckIfDaemonRunningAndCleanupStaleState: vi.fn(),
  mockSpawnAgentHubCLI: vi.fn(),
  mockIsSystemdDaemonInstalled: vi.fn(),
  mockStartSystemdDaemon: vi.fn(),
}))

vi.mock('@/ui/logger', () => ({
  logger: {
    debug: mocks.mockLoggerDebug,
  },
}))

vi.mock('./controlClient', () => ({
  isDaemonRunningCurrentlyInstalledAgentHubVersion: mocks.mockIsDaemonRunningCurrentlyInstalledAgentHubVersion,
  checkIfDaemonRunningAndCleanupStaleState: mocks.mockCheckIfDaemonRunningAndCleanupStaleState,
}))

vi.mock('@/utils/spawnAgentHubCLI', () => ({
  spawnAgentHubCLI: mocks.mockSpawnAgentHubCLI,
}))

vi.mock('./systemdSupervisor', () => ({
  isSystemdDaemonInstalled: mocks.mockIsSystemdDaemonInstalled,
  startSystemdDaemon: mocks.mockStartSystemdDaemon,
}))

import { ensureDaemonRunning } from './ensureDaemonRunning'

describe('ensureDaemonRunning', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.mockSpawnAgentHubCLI.mockReturnValue({
      unref: vi.fn(),
    })
    mocks.mockIsSystemdDaemonInstalled.mockReturnValue(false)
    mocks.mockCheckIfDaemonRunningAndCleanupStaleState.mockResolvedValue(true)
  })

  it('returns without spawning when the daemon is already running', async () => {
    mocks.mockIsDaemonRunningCurrentlyInstalledAgentHubVersion.mockResolvedValue(true)

    await ensureDaemonRunning()

    expect(mocks.mockSpawnAgentHubCLI).not.toHaveBeenCalled()
    expect(mocks.mockCheckIfDaemonRunningAndCleanupStaleState).not.toHaveBeenCalled()
    expect(mocks.mockLoggerDebug).toHaveBeenCalledWith(
      'Ensuring AgentHub background service is running & matches our version...',
    )
  })

  it('starts the daemon and waits for readiness when the installed version is not running', async () => {
    const mockUnref = vi.fn()
    mocks.mockIsDaemonRunningCurrentlyInstalledAgentHubVersion.mockResolvedValue(false)
    mocks.mockSpawnAgentHubCLI.mockReturnValue({
      unref: mockUnref,
    })
    mocks.mockCheckIfDaemonRunningAndCleanupStaleState
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)

    await ensureDaemonRunning()

    expect(mocks.mockSpawnAgentHubCLI).toHaveBeenCalledWith(['daemon', 'start-sync'], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    expect(mockUnref).toHaveBeenCalled()
    expect(mocks.mockCheckIfDaemonRunningAndCleanupStaleState).toHaveBeenCalledTimes(2)
    expect(mocks.mockLoggerDebug).toHaveBeenCalledWith('Starting AgentHub background service...')
    expect(mocks.mockLoggerDebug).toHaveBeenCalledWith('AgentHub background service is ready')
  })
})
