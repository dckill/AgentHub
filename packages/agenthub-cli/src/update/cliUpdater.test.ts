import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import {
  buildCliInstallEnvironment,
  CliUpdateManager,
  compareSemver,
  fetchCliRelease,
  type CliUpdateDependencies,
} from './cliUpdater';

function dependencies(overrides: Partial<CliUpdateDependencies> = {}): CliUpdateDependencies {
  return {
    now: () => 1_000,
    fetchRelease: vi.fn(async (version?: string) => ({
      version: version ?? '1.2.0',
      integrity: 'sha512-release',
    })),
    installVersion: vi.fn(async () => undefined),
    canInstall: () => ({ ok: true }),
    ...overrides,
  };
}

describe('CLI updater', () => {
  it('prepends the active Node directory for npm shebangs under a restricted daemon PATH', () => {
    expect(buildCliInstallEnvironment(
      { PATH: '/usr/local/sbin:/usr/bin' },
      '/home/agent/.nvm/versions/node/v25.1.0/bin/node',
    )).toMatchObject({
      PATH: '/home/agent/.nvm/versions/node/v25.1.0/bin:/usr/local/sbin:/usr/bin',
      npm_config_loglevel: 'warn',
    });
  });

  it('preserves the Windows Path key instead of adding a competing PATH entry', () => {
    const environment = buildCliInstallEnvironment(
      { Path: 'C:\\Windows\\System32' },
      'C:\\Program Files\\nodejs\\node.exe',
      ';',
    );

    expect(environment.Path).toBe('C:\\Program Files\\nodejs;C:\\Windows\\System32');
    expect(environment.PATH).toBeUndefined();
  });

  it('compares stable and prerelease SemVer values without accepting malformed versions', () => {
    expect(compareSemver('1.2.0', '1.1.9')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '1.2.0')).toBe(0);
    expect(compareSemver('1.2.0-beta.2', '1.2.0-beta.1')).toBeGreaterThan(0);
    expect(compareSemver('1.2.0', '1.2.0-beta.9')).toBeGreaterThan(0);
    expect(() => compareSemver('latest', '1.2.0')).toThrow();
  });

  it('reads an exact release from registry metadata and rejects version substitution', async () => {
    const fetchImpl = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify({
      name: '@artsum/agenthub',
      version: '1.2.0',
      dist: { integrity: 'sha512-release' },
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(fetchCliRelease({ version: '1.2.0', fetchImpl: fetchImpl as typeof fetch })).resolves.toEqual({
      version: '1.2.0',
      integrity: 'sha512-release',
    });
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('1.2.0');

    const substituted = vi.fn(async (_input: string | URL | Request) => new Response(JSON.stringify({
      name: '@artsum/agenthub',
      version: '1.2.1',
      dist: { integrity: 'sha512-other' },
    }), { status: 200 }));
    await expect(fetchCliRelease({ version: '1.2.0', fetchImpl: substituted as typeof fetch })).rejects.toThrow(/version/i);
  });

  it('checks, installs the exact resolved version, and records rollback data atomically', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'agenthub-update-'));
    const deps = dependencies();
    const manager = new CliUpdateManager({ currentVersion: '1.1.4', homeDir, dependencies: deps });

    await expect(manager.check()).resolves.toMatchObject({
      phase: 'available',
      currentVersion: '1.1.4',
      latestVersion: '1.2.0',
      updateAvailable: true,
    });
    await expect(manager.apply('1.2.0')).resolves.toMatchObject({
      phase: 'restarting',
      targetVersion: '1.2.0',
    });
    expect(deps.installVersion).toHaveBeenCalledWith('1.2.0');
    expect(JSON.parse(readFileSync(join(homeDir, 'update', 'state.json'), 'utf8'))).toMatchObject({
      previousVersion: '1.1.4',
      targetVersion: '1.2.0',
    });
  });

  it('still reports an available release when the local install cannot self-update', async () => {
    const manager = new CliUpdateManager({
      currentVersion: '1.1.4',
      homeDir: mkdtempSync(join(tmpdir(), 'agenthub-update-')),
      dependencies: dependencies({ canInstall: () => ({ ok: false, reason: 'managed by workspace' }) }),
    });

    await expect(manager.check()).resolves.toMatchObject({
      phase: 'available', latestVersion: '1.2.0', updateAvailable: true,
      canUpdate: false, unsupportedReason: 'managed by workspace',
    });
    await expect(manager.requestUpdate()).resolves.toMatchObject({ accepted: false });
  });

  it('deduplicates concurrent update requests and publishes a failed state', async () => {
    let rejectInstall!: (error: Error) => void;
    const installVersion = vi.fn(() => new Promise<void>((_resolve, reject) => { rejectInstall = reject; }));
    const manager = new CliUpdateManager({
      currentVersion: '1.1.4',
      homeDir: mkdtempSync(join(tmpdir(), 'agenthub-update-')),
      dependencies: dependencies({ installVersion }),
    });

    const first = manager.requestUpdate('1.2.0');
    await vi.waitFor(() => expect(installVersion).toHaveBeenCalledTimes(1));
    await expect(manager.requestUpdate('1.2.0')).resolves.toMatchObject({ accepted: false });
    rejectInstall(new Error('permission denied'));
    await expect(first).resolves.toMatchObject({ accepted: true });
    await vi.waitFor(() => expect(manager.getStatus()).toMatchObject({ phase: 'failed', error: 'permission denied' }));
  });

  it('uses the recorded previous version for rollback', async () => {
    const homeDir = mkdtempSync(join(tmpdir(), 'agenthub-update-'));
    const firstDeps = dependencies();
    const first = new CliUpdateManager({ currentVersion: '1.1.4', homeDir, dependencies: firstDeps });
    await first.apply('1.2.0');

    const rollbackDeps = dependencies();
    const current = new CliUpdateManager({ currentVersion: '1.2.0', homeDir, dependencies: rollbackDeps });
    await expect(current.rollback()).resolves.toMatchObject({ targetVersion: '1.1.4', phase: 'restarting' });
    expect(rollbackDeps.installVersion).toHaveBeenCalledWith('1.1.4');
  });
});
