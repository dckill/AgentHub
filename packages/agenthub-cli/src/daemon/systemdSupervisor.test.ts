import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isSystemdDaemonInstalled: vi.fn(),
  startSystemdDaemon: vi.fn(),
  isDaemonRunningCurrentlyInstalledAgentHubVersion: vi.fn(),
  checkIfDaemonRunningAndCleanupStaleState: vi.fn(),
  spawnAgentHubCLI: vi.fn(),
}));

vi.mock('./systemdSupervisor', () => ({
  isSystemdDaemonInstalled: mocks.isSystemdDaemonInstalled,
  startSystemdDaemon: mocks.startSystemdDaemon,
}));

vi.mock('@/ui/logger', () => ({
  logger: { debug: vi.fn() },
}));

vi.mock('./controlClient', () => ({
  isDaemonRunningCurrentlyInstalledAgentHubVersion: mocks.isDaemonRunningCurrentlyInstalledAgentHubVersion,
  checkIfDaemonRunningAndCleanupStaleState: mocks.checkIfDaemonRunningAndCleanupStaleState,
}));

vi.mock('@/utils/spawnAgentHubCLI', () => ({
  spawnAgentHubCLI: mocks.spawnAgentHubCLI,
}));

import { ensureDaemonRunning } from './ensureDaemonRunning';

describe('ensureDaemonRunning systemd supervision', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.isDaemonRunningCurrentlyInstalledAgentHubVersion.mockResolvedValue(false);
    mocks.checkIfDaemonRunningAndCleanupStaleState.mockResolvedValue(true);
    mocks.startSystemdDaemon.mockResolvedValue(undefined);
    mocks.spawnAgentHubCLI.mockReturnValue({ unref: vi.fn() });
  });

  it('starts the installed systemd service instead of spawning a second manual daemon', async () => {
    mocks.isSystemdDaemonInstalled.mockReturnValue(true);

    await ensureDaemonRunning();

    expect(mocks.startSystemdDaemon).toHaveBeenCalledTimes(1);
    expect(mocks.spawnAgentHubCLI).not.toHaveBeenCalled();
    expect(mocks.checkIfDaemonRunningAndCleanupStaleState).toHaveBeenCalled();
  });
});
