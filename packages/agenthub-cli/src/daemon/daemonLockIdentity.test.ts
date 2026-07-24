import { afterEach, describe, expect, it, vi } from 'vitest';
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalEnv = { ...process.env };
afterEach(() => { process.env = { ...originalEnv }; vi.resetModules(); });

describe('daemon lock owner identity', () => {
  it('reclaims a PID-reused lock and never deletes a replacement owner lock', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agenthub-owner-lock-'));
    process.env.AGENTHUB_HOME_DIR = home;
    vi.resetModules();
    try {
      const { configuration } = await import('@/configuration');
      const { readProcessIdentity } = await import('./processIdentity');
      const persistence = await import('@/persistence');
      const identity = (await readProcessIdentity(process.pid))!;
      writeFileSync(configuration.daemonLockFile, JSON.stringify({
        ownerNonce: 'stale-owner', processIdentity: { ...identity, startMarker: `${identity.startMarker}-reused` },
      }), { mode: 0o600 });

      const lock = await persistence.acquireDaemonLock(1, 1, { ownerNonce: 'new-owner', processIdentity: identity });
      expect(lock).not.toBeNull();
      expect(JSON.parse(readFileSync(configuration.daemonLockFile, 'utf8')).ownerNonce).toBe('new-owner');

      writeFileSync(configuration.daemonLockFile, JSON.stringify({ ownerNonce: 'replacement-owner', processIdentity: identity }), { mode: 0o600 });
      await persistence.releaseDaemonLock(lock!);
      expect(existsSync(configuration.daemonLockFile)).toBe(true);
      expect(JSON.parse(readFileSync(configuration.daemonLockFile, 'utf8')).ownerNonce).toBe('replacement-owner');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });

  it('leaves an undeletable lock fail-closed and reclaims it only after stale identity is proven', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agenthub-owner-lock-readonly-'));
    process.env.AGENTHUB_HOME_DIR = home;
    vi.resetModules();
    try {
      const { configuration } = await import('@/configuration');
      const { readProcessIdentity } = await import('./processIdentity');
      const persistence = await import('@/persistence');
      const identity = (await readProcessIdentity(process.pid))!;
      const lock = await persistence.acquireDaemonLock(1, 1, { ownerNonce: 'same-owner', processIdentity: identity });
      expect(lock).not.toBeNull();

      chmodSync(home, 0o500);
      await persistence.releaseDaemonLock(lock!);
      expect(existsSync(configuration.daemonLockFile)).toBe(true);

      chmodSync(home, 0o700);
      writeFileSync(configuration.daemonLockFile, JSON.stringify({
        ownerNonce: 'stale-owner',
        processIdentity: { ...identity, startMarker: `${identity.startMarker}-stale` },
      }), { mode: 0o600 });
      const recovered = await persistence.acquireDaemonLock(1, 1, { ownerNonce: 'recovered-owner', processIdentity: identity });
      expect(recovered).not.toBeNull();
      expect(JSON.parse(readFileSync(configuration.daemonLockFile, 'utf8')).ownerNonce).toBe('recovered-owner');
      await persistence.releaseDaemonLock(recovered!);
      expect(existsSync(configuration.daemonLockFile)).toBe(false);
    } finally {
      chmodSync(home, 0o700);
      rmSync(home, { recursive: true, force: true });
    }
  });
});
