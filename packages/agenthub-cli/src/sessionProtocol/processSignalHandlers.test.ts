import { describe, expect, it, vi } from 'vitest';
import { registerRunnerFatalHandlers, registerRunnerSignalHandlers } from './processSignalHandlers';

describe('registerRunnerSignalHandlers', () => {
  it('registers SIGTERM/SIGINT and removes both listeners idempotently', async () => {
    const onSigterm = vi.fn();
    const onSigint = vi.fn();
    const beforeTerm = process.listenerCount('SIGTERM');
    const beforeInt = process.listenerCount('SIGINT');

    const dispose = registerRunnerSignalHandlers({ onSigterm, onSigint });

    expect(process.listenerCount('SIGTERM')).toBe(beforeTerm + 1);
    expect(process.listenerCount('SIGINT')).toBe(beforeInt + 1);

    process.emit('SIGTERM');
    process.emit('SIGINT');
    expect(onSigterm).toHaveBeenCalledTimes(1);
    expect(onSigint).toHaveBeenCalledTimes(1);

    dispose();
    dispose();
    expect(process.listenerCount('SIGTERM')).toBe(beforeTerm);
    expect(process.listenerCount('SIGINT')).toBe(beforeInt);
  });
});

describe('registerRunnerFatalHandlers', () => {
  it('routes fatal process failures and removes both listeners idempotently', async () => {
    const onUncaughtException = vi.fn();
    const onUnhandledRejection = vi.fn();
    const beforeExceptions = process.listeners('uncaughtException');
    const beforeRejections = process.listeners('unhandledRejection');

    const dispose = registerRunnerFatalHandlers({ onUncaughtException, onUnhandledRejection });
    const exceptionListener = process.listeners('uncaughtException')
      .find((listener) => !beforeExceptions.includes(listener));
    const rejectionListener = process.listeners('unhandledRejection')
      .find((listener) => !beforeRejections.includes(listener));

    expect(exceptionListener).toBeDefined();
    expect(rejectionListener).toBeDefined();
    exceptionListener?.(new Error('boom'), 'uncaughtException');
    rejectionListener?.(new Error('rejected'), Promise.resolve());

    expect(onUncaughtException).toHaveBeenCalledWith(expect.any(Error));
    expect(onUnhandledRejection).toHaveBeenCalledWith(expect.any(Error));

    dispose();
    dispose();
    expect(process.listeners('uncaughtException')).toEqual(beforeExceptions);
    expect(process.listeners('unhandledRejection')).toEqual(beforeRejections);
  });
});
