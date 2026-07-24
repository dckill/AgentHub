import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDaemonCleanup } from './daemonCleanup';
import { createShutdownWatchdog } from './shutdownWatchdog';

describe('daemon cleanup resilience', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('continues local cleanup when the server state update fails', async () => {
    const calls: string[] = [];
    const onError = vi.fn((phase: string) => calls.push(`error:${phase}`));

    await runDaemonCleanup({
      updateDaemonState: vi.fn(async () => { throw new Error('server unavailable'); }),
      waitForMetadata: vi.fn(async () => { calls.push('wait'); }),
      shutdownApiMachine: vi.fn(async () => { calls.push('api-shutdown'); }),
      stopControlServer: vi.fn(async () => { calls.push('control-stop'); }),
      cleanupDaemonState: vi.fn(async () => { calls.push('state-cleanup'); }),
      stopCaffeinate: vi.fn(async () => { calls.push('caffeinate-stop'); }),
      releaseDaemonLock: vi.fn(async () => { calls.push('lock-release'); }),
      cancelWatchdog: vi.fn(() => { calls.push('watchdog-cancel'); }),
      onError,
    });

    expect(calls).toEqual([
      'error:updateDaemonState',
      'wait',
      'api-shutdown',
      'control-stop',
      'state-cleanup',
      'caffeinate-stop',
      'lock-release',
      'watchdog-cancel',
    ]);
    expect(onError).toHaveBeenCalledTimes(1);
  });

  it('bounds a hung remote cleanup step before running local cleanup', async () => {
    const calls: string[] = [];
    const onError = vi.fn((phase: string) => calls.push(`error:${phase}`));

    await runDaemonCleanup({
      updateDaemonState: () => new Promise<void>(() => {}),
      waitForMetadata: async () => { calls.push('wait'); },
      shutdownApiMachine: async () => { calls.push('api-shutdown'); },
      stopControlServer: async () => { calls.push('control-stop'); },
      cleanupDaemonState: async () => { calls.push('state-cleanup'); },
      stopCaffeinate: async () => { calls.push('caffeinate-stop'); },
      releaseDaemonLock: async () => { calls.push('lock-release'); },
      cancelWatchdog: () => { calls.push('watchdog-cancel'); },
      onError,
      stepTimeoutMs: 5,
    });

    expect(calls).toEqual([
      'error:updateDaemonState',
      'wait',
      'api-shutdown',
      'control-stop',
      'state-cleanup',
      'caffeinate-stop',
      'lock-release',
      'watchdog-cancel',
    ]);
  });

  it('continues every cleanup phase even when error reporting throws', async () => {
    const calls: string[] = [];

    await expect(runDaemonCleanup({
      updateDaemonState: async () => { calls.push('update'); throw new Error('update failed'); },
      waitForMetadata: async () => { calls.push('wait'); },
      shutdownApiMachine: async () => { calls.push('api'); },
      stopControlServer: async () => { calls.push('control'); },
      cleanupDaemonState: async () => { calls.push('state'); },
      stopCaffeinate: async () => { calls.push('caffeinate'); },
      releaseDaemonLock: async () => { calls.push('lock'); },
      cancelWatchdog: () => { calls.push('cancel'); },
      onError: () => { calls.push('report'); throw new Error('reporter failed'); },
    })).resolves.toBeUndefined();

    expect(calls).toEqual([
      'update',
      'report',
      'wait',
      'api',
      'control',
      'state',
      'caffeinate',
      'lock',
      'cancel',
    ]);
  });

  it('keeps the watchdog alive long enough to attempt every bounded cleanup phase', async () => {
    vi.useFakeTimers();
    const forcedExit = vi.fn();
    const watchdog = createShutdownWatchdog(forcedExit);
    const calls: string[] = [];
    watchdog.request();

    const cleanup = runDaemonCleanup({
      updateDaemonState: () => new Promise<void>(() => {}),
      waitForMetadata: () => new Promise<void>(() => {}),
      shutdownApiMachine: () => new Promise<void>(() => {}),
      stopControlServer: () => new Promise<void>(() => {}),
      cleanupDaemonState: () => new Promise<void>(() => {}),
      stopCaffeinate: () => new Promise<void>(() => {}),
      releaseDaemonLock: () => new Promise<void>(() => {}),
      cancelWatchdog: () => { calls.push('cancel'); watchdog.cancel(); },
      onError: (phase) => { calls.push(phase); },
    });

    for (let step = 0; step < 7; step += 1) {
      await vi.advanceTimersByTimeAsync(250);
    }
    await cleanup;

    expect(calls).toEqual([
      'updateDaemonState',
      'waitForMetadata',
      'shutdownApiMachine',
      'stopControlServer',
      'cleanupDaemonState',
      'stopCaffeinate',
      'releaseDaemonLock',
      'cancel',
    ]);
    expect(forcedExit).not.toHaveBeenCalled();
  });
});
