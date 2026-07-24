import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  readCredentials: vi.fn(),
  readSettings: vi.fn(),
  clearCredentials: vi.fn(),
  clearMachineId: vi.fn(),
  authAndSetupMachineIfNeeded: vi.fn(),
  stopDaemon: vi.fn(),
  setupDaemonAfterLogin: vi.fn(),
  formatPostLoginSetupResult: vi.fn(),
}))

vi.mock('@/persistence', () => ({
  readCredentials: mocks.readCredentials,
  readSettings: mocks.readSettings,
  clearCredentials: mocks.clearCredentials,
  clearMachineId: mocks.clearMachineId,
}))

vi.mock('@/ui/auth', () => ({
  authAndSetupMachineIfNeeded: mocks.authAndSetupMachineIfNeeded,
}))

vi.mock('@/daemon/controlClient', () => ({
  stopDaemon: mocks.stopDaemon,
  checkIfDaemonRunningAndCleanupStaleState: vi.fn(),
}))

vi.mock('@/daemon/postLoginSetup', () => ({
  setupDaemonAfterLogin: mocks.setupDaemonAfterLogin,
  formatPostLoginSetupResult: mocks.formatPostLoginSetupResult,
}))

vi.mock('@/ui/logger', () => ({
  logger: { debug: vi.fn() },
}))

import { handleAuthCommand } from './auth'

describe('auth login post-login onboarding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.readCredentials.mockResolvedValue(null)
    mocks.readSettings.mockResolvedValue(null)
    mocks.clearCredentials.mockResolvedValue(undefined)
    mocks.clearMachineId.mockResolvedValue(undefined)
    mocks.stopDaemon.mockResolvedValue(undefined)
    mocks.authAndSetupMachineIfNeeded.mockResolvedValue({
      credentials: { token: 'token' },
      machineId: 'machine-new',
    })
    mocks.setupDaemonAfterLogin.mockResolvedValue({
      ready: true,
      steps: [],
      manualActions: [],
    })
    mocks.formatPostLoginSetupResult.mockReturnValue('setup summary')
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('runs onboarding after a new mobile authentication', async () => {
    await handleAuthCommand(['login'])

    expect(mocks.setupDaemonAfterLogin).toHaveBeenCalledTimes(1)
    expect(mocks.formatPostLoginSetupResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ machineId: 'machine-new' }),
    )
    expect(console.log).toHaveBeenCalledWith('setup summary')
  })

  it('uses login as a repair entry point even when credentials and machine ID already exist', async () => {
    mocks.readCredentials.mockResolvedValue({ token: 'existing-token' })
    mocks.readSettings.mockResolvedValue({ machineId: 'machine-existing' })

    await handleAuthCommand(['login'])

    expect(mocks.authAndSetupMachineIfNeeded).not.toHaveBeenCalled()
    expect(mocks.setupDaemonAfterLogin).toHaveBeenCalledTimes(1)
    expect(mocks.formatPostLoginSetupResult).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ machineId: 'machine-existing' }),
    )
  })

  it('can explicitly skip daemon service setup without affecting authentication', async () => {
    await handleAuthCommand(['login', '--no-daemon-setup'])

    expect(mocks.authAndSetupMachineIfNeeded).toHaveBeenCalledTimes(1)
    expect(mocks.setupDaemonAfterLogin).not.toHaveBeenCalled()
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('已跳过后台服务自动接入'))
  })

  it('runs onboarding only after force authentication has cleared the old machine', async () => {
    await handleAuthCommand(['login', '--force'])

    expect(mocks.stopDaemon).toHaveBeenCalledTimes(1)
    expect(mocks.clearCredentials).toHaveBeenCalledTimes(1)
    expect(mocks.clearMachineId).toHaveBeenCalledTimes(1)
    expect(
      mocks.authAndSetupMachineIfNeeded.mock.invocationCallOrder[0],
    ).toBeLessThan(mocks.setupDaemonAfterLogin.mock.invocationCallOrder[0])
  })

  it('keeps authentication successful when an unexpected onboarding error occurs', async () => {
    mocks.setupDaemonAfterLogin.mockRejectedValue(new Error('service manager unavailable'))

    await handleAuthCommand(['login'])

    expect(mocks.authAndSetupMachineIfNeeded).toHaveBeenCalledTimes(1)
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining('Authentication failed'),
      expect.anything(),
    )
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('认证已成功'))
    expect(console.log).toHaveBeenCalledWith(expect.stringContaining('agenthub daemon install'))
  })
})
