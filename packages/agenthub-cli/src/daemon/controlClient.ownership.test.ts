import { beforeEach, describe, expect, it, vi } from 'vitest';

const identity = {
  pid: 42, startMarker: '100', executablePath: '/usr/bin/node',
  commandDigest: 'a'.repeat(64), bootId: 'boot-1',
};
const state = { pid: 42, httpPort: 1234, controlToken: 'token', ownerNonce: 'nonce', processIdentity: identity, startTime: 'now', startedWithCliVersion: '1.0.3' };
const persistence = vi.hoisted(() => ({ readDaemonState: vi.fn(), clearDaemonState: vi.fn() }));
const processIdentity = vi.hoisted(() => ({ readProcessIdentity: vi.fn() }));

vi.mock('@/persistence', () => persistence);
vi.mock('./processIdentity', async (importOriginal) => ({
  ...await importOriginal<typeof import('./processIdentity')>(),
  readProcessIdentity: processIdentity.readProcessIdentity,
}));
vi.mock('@/ui/logger', () => ({ logger: { debug: vi.fn() } }));
vi.mock('@/configuration', () => ({ configuration: { currentCliVersion: '1.0.3' } }));

import { checkIfDaemonRunningAndCleanupStaleState, stopDaemon } from './controlClient';

describe('daemon control ownership safety', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    persistence.readDaemonState.mockResolvedValue(state);
    processIdentity.readProcessIdentity.mockResolvedValue(identity);
  });

  it('keeps a confirmed owner when HTTP health temporarily fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));

    await expect(checkIfDaemonRunningAndCleanupStaleState()).resolves.toBe(true);
    expect(persistence.clearDaemonState).not.toHaveBeenCalled();
  });

  it('cleans a reused PID state without signaling the unrelated process', async () => {
    processIdentity.readProcessIdentity.mockResolvedValue({ ...identity, startMarker: 'reused' });
    const kill = vi.spyOn(process, 'kill');

    await stopDaemon();

    expect(persistence.clearDaemonState).toHaveBeenCalledOnce();
    expect(kill).not.toHaveBeenCalled();
  });
});
