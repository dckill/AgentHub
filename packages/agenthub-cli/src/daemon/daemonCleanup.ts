export type DaemonCleanupSteps = {
  updateDaemonState: () => Promise<void>;
  waitForMetadata: () => Promise<void>;
  shutdownApiMachine: () => void | Promise<void>;
  stopControlServer: () => Promise<void>;
  cleanupDaemonState: () => Promise<void>;
  stopCaffeinate: () => Promise<void>;
  releaseDaemonLock: () => Promise<void>;
  cancelWatchdog: () => void;
  onError?: (phase: string, error: unknown) => void;
  stepTimeoutMs?: number;
};

export async function runDaemonCleanup(steps: DaemonCleanupSteps): Promise<void> {
  // Must complete before the daemon shutdown watchdog can force-exit;
  // remote API work is best-effort and must never delay local lock/state cleanup.
  const stepTimeoutMs = steps.stepTimeoutMs ?? 250;
  const reportError = (phase: string, error: unknown): void => {
    try {
      steps.onError?.(phase, error);
    } catch {
      // Error reporting is best-effort. A logger/telemetry failure must never
      // prevent state, lock, control-server, or process cleanup.
    }
  };
  const attempt = async (phase: string, action: () => void | Promise<void>): Promise<void> => {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        Promise.resolve().then(action),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`Cleanup step timed out after ${stepTimeoutMs}ms`)), stepTimeoutMs);
          timer.unref?.();
        }),
      ]);
    } catch (error) {
      reportError(phase, error);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };

  await attempt('updateDaemonState', steps.updateDaemonState);
  await attempt('waitForMetadata', steps.waitForMetadata);
  await attempt('shutdownApiMachine', steps.shutdownApiMachine);
  await attempt('stopControlServer', steps.stopControlServer);
  await attempt('cleanupDaemonState', steps.cleanupDaemonState);
  await attempt('stopCaffeinate', steps.stopCaffeinate);
  await attempt('releaseDaemonLock', steps.releaseDaemonLock);

  try {
    steps.cancelWatchdog();
  } catch (error) {
    reportError('cancelWatchdog', error);
  }
}
