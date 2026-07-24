type MaybePromise = void | Promise<void>;

export type RunnerSignalHandlers = {
  onSigterm: () => MaybePromise;
  onSigint: () => MaybePromise;
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
