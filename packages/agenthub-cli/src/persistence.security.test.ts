import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
  vi.resetModules();
});

describe('CLI sensitive persistence permissions', () => {
  it('writes credentials, settings, sessions and daemon lock as 0600 under umask 022', async () => {
    const home = mkdtempSync(join(tmpdir(), 'agenthub-private-files-'));
    const oldUmask = process.umask(0o022);
    process.env.AGENTHUB_HOME_DIR = home;
    vi.resetModules();
    try {
      const persistence = await import('./persistence');
      const { configuration } = await import('./configuration');
      await persistence.writeCredentialsLegacy({ secret: new Uint8Array(32).fill(7), token: 'secret-token' });
      await persistence.updateSettings(settings => ({ ...settings, onboardingCompleted: true }));
      persistence.persistSession('session-1', {
        encryptionKey: 'secret-session-key', encryptionVariant: 'dataKey', seq: 1,
        metadataVersion: 1, agentStateVersion: 1, metadata: {} as any, savedAt: Date.now(),
      });
      const lock = await persistence.acquireDaemonLock(1, 1);
      expect(lock).not.toBeNull();

      for (const file of [configuration.privateKeyFile, configuration.settingsFile, configuration.sessionsFile, configuration.daemonLockFile]) {
        expect(statSync(file).mode & 0o777, file).toBe(0o600);
      }
      if (lock) await persistence.releaseDaemonLock(lock);
    } finally {
      process.umask(oldUmask);
      rmSync(home, { recursive: true, force: true });
    }
  });
});
