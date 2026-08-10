type MaybePromise = void | Promise<void>;

export type RunnerSignalHandlers = {
  onSigterm: () => MaybePromise;
  onSigint: () => MaybePromise;
};

export type RunnerFatalHandlers = {
  onUncaughtException: (error: Error) => MaybePromise;
  onUnhandledRejection: (reason: unknown) => MaybePromise;
};

/**
 * Register runner termination signals and return an idempotent disposer.
 * Runners normally exit after shutdown, but disposing prevents listener
 * accumulation when a runner is embedded, restarted, or exercised in-process.
 */
export function registerRunnerSignalHandlers(handlers: RunnerSignalHandlers): () => void {
  const onSigterm = () => {
    void handlers.onSigterm();
  };
  const onSigint = () => {
    void handlers.onSigint();
  };

  process.once('SIGTERM', onSigterm);
  process.once('SIGINT', onSigint);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    process.removeListener('SIGTERM', onSigterm);
    process.removeListener('SIGINT', onSigint);
  };
}

/** Register fatal process events separately so signal behavior stays stable. */
export function registerRunnerFatalHandlers(handlers: RunnerFatalHandlers): () => void {
  const onUncaughtException = (error: Error) => {
    void handlers.onUncaughtException(error);
  };
  const onUnhandledRejection = (reason: unknown) => {
    void handlers.onUnhandledRejection(reason);
  };

  process.once('uncaughtException', onUncaughtException);
  process.once('unhandledRejection', onUnhandledRejection);

  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    process.removeListener('uncaughtException', onUncaughtException);
    process.removeListener('unhandledRejection', onUnhandledRejection);
  };
}
