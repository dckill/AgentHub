export type ShutdownWatchdog = {
  /** Returns true only for the first shutdown request. */
  request: () => boolean;
  /** Cancels the forced-exit fallback after graceful cleanup succeeds. */
  cancel: () => void;
};

export function createShutdownWatchdog(onTimeout: () => void, timeoutMs = 2_500): ShutdownWatchdog {
  let requested = false;
  let timer: NodeJS.Timeout | null = null;

  return {
    request: () => {
      if (requested) {
        return false;
      }

      requested = true;
      timer = setTimeout(() => {
        timer = null;
        onTimeout();
      }, timeoutMs);
      timer.unref?.();
      return true;
    },
    cancel: () => {
      if (!timer) {
        return;
      }
      clearTimeout(timer);
      timer = null;
    },
  };
}
