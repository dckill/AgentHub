import { describe, expect, it } from 'vitest';
import {
  createLifecycleFixtureChildScript,
  createLifecycleFixtureMetadata,
  publicLifecycleFixtureReport,
} from './lifecycleWebFixture';

describe('lifecycle Web fixture', () => {
  it('builds a real machine-scoped running session without inventing a provider turn', () => {
    expect(createLifecycleFixtureMetadata({
      cwd: '/tmp/project',
      homeDir: '/tmp/home',
      machineId: 'machine-1',
      hostPid: 123,
      host: 'fixture-host',
    })).toMatchObject({
      path: '/tmp/project',
      machineId: 'machine-1',
      hostPid: 123,
      host: 'fixture-host',
      startedBy: 'terminal',
      lifecycleState: 'running',
      flavor: 'codex',
    });
  });

  it('exposes only identifiers needed by the browser harness', () => {
    const report = publicLifecycleFixtureReport({
      sessionId: 'session-1',
      machineId: 'machine-1',
      childPid: 123,
      token: 'must-not-leak',
      encryptionKey: 'must-not-leak',
    });
    expect(report).toEqual({ sessionId: 'session-1', machineId: 'machine-1', childPid: 123 });
    expect(JSON.stringify(report)).not.toMatch(/token|encryption|must-not-leak/);
  });

  it('uses explicit cooperative and stubborn child behavior without shell interpolation', () => {
    const cooperative = createLifecycleFixtureChildScript('cooperative');
    const stubborn = createLifecycleFixtureChildScript('stubborn');
    expect(cooperative).toContain("process.on('SIGTERM', () => setTimeout(() => process.exit(0), 900))");
    expect(stubborn).toContain("process.on('SIGTERM', () => {})");
    expect(cooperative).not.toMatch(/exec|spawn|shell/);
    expect(stubborn).not.toMatch(/exec|spawn|shell/);
  });
});
