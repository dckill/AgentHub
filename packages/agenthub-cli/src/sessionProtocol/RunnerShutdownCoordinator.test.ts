import { describe, expect, it, vi } from 'vitest';
import { createRunnerShutdownCoordinator } from './RunnerShutdownCoordinator';

function createHarness(failAt?: string) {
  const calls: string[] = [];
  const step = (name: string) => vi.fn(async () => {
    calls.push(name);
    if (failAt === name) throw new Error(`${name} failed`);
  });
  const coordinator = createRunnerShutdownCoordinator({
    stopAcceptingTurns: step('stop-accepting'),
    abortBackend: step('abort-backend'),
    closeActiveTurn: step('turn-end'),
    publishThinkingFalse: step('thinking:false'),
    markArchived: vi.fn(async (request) => {
      calls.push(`archived:${request.reason}`);
      if (failAt === 'archived') throw new Error('archived failed');
    }),
    sendSessionDeath: step('session-end'),
    flush: step('flush'),
    closeSession: step('close-session'),
    cleanupLocalResources: step('cleanup-local'),
  });
  return { calls, coordinator };
}

describe('RunnerShutdownCoordinator', () => {
  it.each(['SIGTERM', 'SIGINT', 'archive', 'backend-fatal', 'kill-rpc'])(
    'uses the same ordered terminal sequence for %s',
    async (trigger) => {
      const { calls, coordinator } = createHarness();

      await coordinator.shutdown({ reason: trigger, turnStatus: trigger === 'backend-fatal' ? 'failed' : 'cancelled' });

      expect(calls).toEqual([
        'stop-accepting',
        'abort-backend',
        'turn-end',
        'thinking:false',
        `archived:${trigger}`,
        'session-end',
        'flush',
        'close-session',
        'cleanup-local',
      ]);
      expect(coordinator.state()).toBe('exited');
    },
  );

  it('is idempotent when signal, archive and backend fatal race', async () => {
    const { calls, coordinator } = createHarness();

    const results = await Promise.all([
      coordinator.shutdown({ reason: 'SIGTERM', turnStatus: 'cancelled' }),
      coordinator.shutdown({ reason: 'archive', turnStatus: 'cancelled' }),
      coordinator.shutdown({ reason: 'backend fatal', turnStatus: 'failed' }),
    ]);

    expect(results[0]).toBe(results[1]);
    expect(results[1]).toBe(results[2]);
    expect(calls.filter((call) => call === 'turn-end')).toHaveLength(1);
    expect(calls.filter((call) => call === 'session-end')).toHaveLength(1);
  });

  it('continues terminal cleanup after an intermediate operation fails', async () => {
    const { calls, coordinator } = createHarness('abort-backend');

    await expect(coordinator.shutdown({ reason: 'backend fatal', turnStatus: 'failed' }))
      .rejects.toThrow('Runner shutdown failed');

    expect(calls).toEqual([
      'stop-accepting',
      'abort-backend',
      'turn-end',
      'thinking:false',
      'archived:backend fatal',
      'session-end',
      'flush',
      'close-session',
      'cleanup-local',
    ]);
    expect(coordinator.state()).toBe('exited');
  });

  it.each([
    'claude',
    'codex',
  ] as const)('%s contract matrix covers startup, idle and active turns for every shutdown trigger', async (flavor) => {
    const phases = ['startup', 'idle', 'active'] as const;
    const triggers = ['SIGTERM', 'SIGINT', 'archive', 'backend-fatal', 'kill-rpc'] as const;

    for (const phase of phases) {
      for (const trigger of triggers) {
        const calls: string[] = [];
        const coordinator = createRunnerShutdownCoordinator({
          stopAcceptingTurns: () => { calls.push(`${flavor}:${phase}:stop-accepting`); },
          abortBackend: () => { calls.push(`${flavor}:${phase}:abort-backend`); },
          closeActiveTurn: () => {
            if (phase === 'active') calls.push(`${flavor}:${phase}:turn-end`);
          },
          publishThinkingFalse: () => { calls.push(`${flavor}:${phase}:thinking:false`); },
          markArchived: () => { calls.push(`${flavor}:${phase}:archived:${trigger}`); },
          sendSessionDeath: () => { calls.push(`${flavor}:${phase}:session-end`); },
          flush: () => { calls.push(`${flavor}:${phase}:flush`); },
          closeSession: () => { calls.push(`${flavor}:${phase}:close-session`); },
          cleanupLocalResources: () => { calls.push(`${flavor}:${phase}:cleanup-local`); },
        });

        await coordinator.shutdown({
          reason: trigger,
          turnStatus: trigger === 'backend-fatal' ? 'failed' : 'cancelled',
        });

        expect(calls).toEqual([
          `${flavor}:${phase}:stop-accepting`,
          `${flavor}:${phase}:abort-backend`,
          ...(phase === 'active' ? [`${flavor}:${phase}:turn-end`] : []),
          `${flavor}:${phase}:thinking:false`,
          `${flavor}:${phase}:archived:${trigger}`,
          `${flavor}:${phase}:session-end`,
          `${flavor}:${phase}:flush`,
          `${flavor}:${phase}:close-session`,
          `${flavor}:${phase}:cleanup-local`,
        ]);
        expect(coordinator.state()).toBe('exited');
      }
    }
  });
});
