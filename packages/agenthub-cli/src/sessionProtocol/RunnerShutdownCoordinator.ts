import type { SessionTurnEndStatus } from '@artsum/agenthub-wire';

export type RunnerShutdownState = 'running' | 'stopping' | 'exited';

export type RunnerShutdownRequest = {
  reason: string;
  turnStatus: SessionTurnEndStatus;
};

type MaybePromise = void | Promise<void>;

export type RunnerShutdownDependencies = {
  stopAcceptingTurns: () => MaybePromise;
  abortBackend: (request: RunnerShutdownRequest) => MaybePromise;
  closeActiveTurn: (status: SessionTurnEndStatus) => MaybePromise;
  publishThinkingFalse: () => MaybePromise;
  markArchived: (request: RunnerShutdownRequest) => MaybePromise;
  sendSessionDeath: () => MaybePromise;
  flush: () => MaybePromise;
  closeSession: () => MaybePromise;
  cleanupLocalResources: () => MaybePromise;
};

export type RunnerShutdownCoordinator = {
  shutdown: (request: RunnerShutdownRequest) => Promise<void>;
  state: () => RunnerShutdownState;
};

export function createRunnerShutdownCoordinator(
  dependencies: RunnerShutdownDependencies,
): RunnerShutdownCoordinator {
  let lifecycleState: RunnerShutdownState = 'running';
  let shutdownPromise: Promise<void> | null = null;

  const shutdown = (request: RunnerShutdownRequest): Promise<void> => {
    if (shutdownPromise) {
      return shutdownPromise;
    }

    lifecycleState = 'stopping';
    shutdownPromise = (async () => {
      const errors: unknown[] = [];
      const run = async (operation: () => MaybePromise) => {
        try {
          await operation();
        } catch (error) {
          errors.push(error);
        }
      };

      await run(dependencies.stopAcceptingTurns);
      await run(() => dependencies.abortBackend(request));
      await run(() => dependencies.closeActiveTurn(request.turnStatus));
      await run(dependencies.publishThinkingFalse);
      await run(() => dependencies.markArchived(request));
      await run(dependencies.sendSessionDeath);
      await run(dependencies.flush);
      await run(dependencies.closeSession);
      await run(dependencies.cleanupLocalResources);

      lifecycleState = 'exited';
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Runner shutdown failed');
      }
    })();

    return shutdownPromise;
  };

  return {
    shutdown,
    state: () => lifecycleState,
  };
}
