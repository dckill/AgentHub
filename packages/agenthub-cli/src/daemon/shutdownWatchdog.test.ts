import { afterEach, describe, expect, it, vi } from 'vitest';
import { createShutdownWatchdog } from './shutdownWatchdog';

describe('daemon shutdown watchdog', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('cancels the forced exit after graceful cleanup completes', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createShutdownWatchdog(onTimeout, 1_000);

    expect(watchdog.request()).toBe(true);
    expect(watchdog.request()).toBe(false);
    watchdog.cancel();
    vi.advanceTimersByTime(1_000);

    expect(onTimeout).not.toHaveBeenCalled();
  });

  it('forces exit once when graceful cleanup never completes', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const watchdog = createShutdownWatchdog(onTimeout, 1_000);

    expect(watchdog.request()).toBe(true);
    vi.advanceTimersByTime(1_000);
    vi.advanceTimersByTime(1_000);

    expect(onTimeout).toHaveBeenCalledTimes(1);
  });
});
