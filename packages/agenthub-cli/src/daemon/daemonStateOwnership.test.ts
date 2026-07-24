import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('daemon state owner identity', () => {
  it('never lets an old daemon cleanup delete replacement daemon state', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agenthub-owner-state-'));
    process.env.AGENTHUB_HOME_DIR = home;
    vi.resetModules();

    try {
      const { configuration } = await import('@/configuration');
      const { cleanupDaemonState } = await import('./controlClient');
      writeFileSync(configuration.daemonStateFile, JSON.stringify({
        pid: process.pid,
        httpPort: 12345,
        ownerNonce: 'replacement-owner',
      }), { mode: 0o600 });

      await (cleanupDaemonState as (expectedOwnerNonce?: string) => Promise<void>)('old-owner');

      expect(existsSync(configuration.daemonStateFile)).toBe(true);
      expect(JSON.parse(readFileSync(configuration.daemonStateFile, 'utf8')).ownerNonce).toBe('replacement-owner');

      await (cleanupDaemonState as (expectedOwnerNonce?: string) => Promise<void>)('replacement-owner');
      expect(existsSync(configuration.daemonStateFile)).toBe(false);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('fails closed on a read-only home and removes only the same owner after recovery', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agenthub-owner-state-readonly-'));
    process.env.AGENTHUB_HOME_DIR = home;
    vi.resetModules();

    try {
      const { configuration } = await import('@/configuration');
      const { cleanupDaemonState } = await import('./controlClient');
      writeFileSync(configuration.daemonStateFile, JSON.stringify({
        pid: process.pid,
        httpPort: 12345,
        ownerNonce: 'same-owner',
      }), { mode: 0o600 });

      chmodSync(home, 0o500);
      await expect(cleanupDaemonState('same-owner')).resolves.toBeUndefined();
      expect(existsSync(configuration.daemonStateFile)).toBe(true);

      chmodSync(home, 0o700);
      await cleanupDaemonState('same-owner');
      expect(existsSync(configuration.daemonStateFile)).toBe(false);
    } finally {
      chmodSync(home, 0o700);
      rmSync(home, { recursive: true, force: true });
    }
  });
});
