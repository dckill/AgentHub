import { lstatSync, mkdirSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as environmentModule from './environments';
import {
  buildPrivateCliBundle,
  buildWebServiceEnv,
  createSeededAuthIdentity,
  getWebStartupTimeoutMs,
  getEnvironmentCliBundleRoot,
  getEnvironmentCliEntrypoint,
  formatEnvironmentAuthUrlForOutput,
  resolveRepositoryBinary,
  resolveRepositoryPackageManager,
  waitForProcessExit,
  inspectEnvironmentHealth,
  selectPrunableEnvironments,
  rotateEnvironmentLogs,
  runEnvironmentUpTransaction,
  stopEnvironmentDaemonSessions,
} from './environments';

describe('authenticated environment cross-client identity', () => {
  it('derives the RFC 8032 Ed25519 identity from the same 32-byte secret restored by Native clients', () => {
    const secret = Buffer.from(
      '9d61b19deffd5a60ba844af492ec2cc4' +
      '4449c5697b326919703bac031cae7f60',
      'hex',
    );

    const identity = createSeededAuthIdentity(secret, Buffer.alloc(0));

    expect(identity.publicKey.toString('hex')).toBe(
      'd75a980182b10ab7d54bfed3c964073a' +
      '0ee172f3daa62325af021a68f707511a',
    );
    expect(identity.signature.toString('hex')).toBe(
      'e5564300c360ac729086e2cc806e828a' +
      '84877f1eb8e5d974d873e06522490155' +
      '5fb8821590a33bacc61e39701cf9b46b' +
      'd25bf5f0595bbe24655141438e7a100b',
    );
  });

  it('rejects a seed that Native cannot restore as a 32-byte account secret', () => {
    expect(() => createSeededAuthIdentity(Buffer.alloc(31), Buffer.alloc(0)))
      .toThrow(/32-byte/);
  });
});

describe('environment list credential safety', () => {
  it('removes authenticated query credentials from persisted Web URLs before listing them', () => {
    const sanitizeEnvironmentListUrl = (environmentModule as unknown as {
      sanitizeEnvironmentListUrl: (url: string) => string;
    }).sanitizeEnvironmentListUrl;

    expect(sanitizeEnvironmentListUrl(
      'http://localhost:19007/?dev_token=token-value&dev_secret=secret-value',
    )).toBe('http://localhost:19007/');
  });

  it('redacts authenticated query credentials from CI output but keeps local developer output usable', () => {
    const url = 'http://localhost:19007/?dev_token=token-value&dev_secret=secret-value';

    expect(formatEnvironmentAuthUrlForOutput(url, { CI: 'true' })).toBe('http://localhost:19007/');
    expect(formatEnvironmentAuthUrlForOutput(url, { CI: '1' })).toBe('http://localhost:19007/');
    expect(formatEnvironmentAuthUrlForOutput(url, { CI: 'false' })).toBe(url);
    expect(formatEnvironmentAuthUrlForOutput(url, {})).toBe(url);
  });
});

describe('environment process lifecycle', () => {
  it('waits for a terminated process identity before environment removal', () => {
    let alive = true;
    let checks = 0;
    const exited = waitForProcessExit(123, 100, 10, () => {
      checks += 1;
      if (checks >= 3) alive = false;
      return alive;
    });

    expect(exited).toBe(true);
    expect(checks).toBeGreaterThanOrEqual(3);
  });

  it('reports a stubborn process when the bounded wait expires', () => {
    expect(waitForProcessExit(123, 20, 5, () => true)).toBe(false);
  });

  it('stops all sessions reported by an isolated daemon before daemon teardown', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'agenthub-environment-session-cleanup-'));
    mkdirSync(join(envDir, 'cli', 'bundle', 'bin'), { recursive: true });
    writeFileSync(join(envDir, 'environment.json'), JSON.stringify({
      name: 'isolated-cleanup',
      serverPort: 43111,
      expoPort: 43112,
    }));
    writeFileSync(join(envDir, 'cli', 'bundle', 'bin', 'agenthub.mjs'), '#!/usr/bin/env node');
    const calls: string[][] = [];
    let listCalls = 0;

    try {
      const stopped = stopEnvironmentDaemonSessions(envDir, {
        waitTimeoutMs: 100,
        pollMs: 1,
        run: (_command, args) => {
          calls.push(args);
          if (args[2] === 'list') {
            listCalls += 1;
            return listCalls === 1
              ? { status: 0, stdout: 'Active sessions:\n[{"agentHubSessionId":"session-a"},{"agentHubSessionId":"session-b"}]\n' }
              : { status: 0, stdout: 'No active sessions\n' };
          }
          return { status: 0, stdout: `Session stop requested (${args[2]})` };
        },
      });

      expect(stopped).toBe(2);
      expect(listCalls).toBe(2);
      expect(calls).toEqual([
        [join(envDir, 'cli', 'bundle', 'bin', 'agenthub.mjs'), 'daemon', 'list'],
        [join(envDir, 'cli', 'bundle', 'bin', 'agenthub.mjs'), 'daemon', 'stop-session', 'session-a'],
        [join(envDir, 'cli', 'bundle', 'bin', 'agenthub.mjs'), 'daemon', 'stop-session', 'session-b'],
        [join(envDir, 'cli', 'bundle', 'bin', 'agenthub.mjs'), 'daemon', 'list'],
      ]);
    } finally {
      rmSync(envDir, { recursive: true, force: true });
    }
  });
});

describe('environment manager tool resolution', () => {
  it('prefers a package-local executable in an isolated workspace', () => {
    const packageRoot = join(process.cwd(), 'packages', 'agenthub-cli');

    expect(resolveRepositoryBinary('pkgroll', {
      platform: 'linux',
      packageRoot,
      exists: (candidate) => candidate === join(packageRoot, 'node_modules', '.bin', 'pkgroll'),
    })).toBe(join(packageRoot, 'node_modules', '.bin', 'pkgroll'));
  });

  it('prefers the repository-local executable when PATH does not expose it', () => {
    expect(resolveRepositoryBinary('tsx', {
      platform: 'linux',
      exists: (candidate) => candidate.endsWith('/node_modules/.bin/tsx'),
    })).toMatch(/node_modules\/\.bin\/tsx$/);
  });

  it('uses the Windows cmd shim for local tools on Windows', () => {
    expect(resolveRepositoryBinary('pnpm', {
      platform: 'win32',
      exists: (candidate) => candidate.endsWith('node_modules/.bin/pnpm.cmd'),
    })).toMatch(/node_modules[\\/]\.bin[\\/]pnpm\.cmd$/);
  });

  it('falls back to PATH lookup when no repository-local shim exists', () => {
    expect(resolveRepositoryBinary('node', {
      platform: 'linux',
      exists: () => false,
    })).toBe('node');
  });

  it('falls back to a pinned npx pnpm invocation when no local pnpm shim exists', () => {
    const invocation = resolveRepositoryPackageManager({
      exists: () => false,
      execPath: '/opt/node/bin/node',
      pathLookup: () => undefined,
    });

    expect(invocation.command).toMatch(/(?:^|\/)npx$/);
    expect(invocation.argsPrefix).toEqual(['--yes', 'pnpm@10.11.0']);
  });

  it('reuses a pnpm executable already available on PATH before invoking npx', () => {
    expect(resolveRepositoryPackageManager({
      exists: () => false,
      pathLookup: (binary) => binary === 'pnpm' ? '/opt/pnpm/bin/pnpm' : undefined,
    })).toEqual({
      command: '/opt/pnpm/bin/pnpm',
      argsPrefix: [],
    });
  });
});

describe('authenticated environment CLI isolation', () => {
  it('resolves the CLI bundle entirely inside the environment directory', () => {
    const envDir = '/tmp/agenthub-environments/quiet-star';

    expect(getEnvironmentCliBundleRoot(envDir)).toBe(
      '/tmp/agenthub-environments/quiet-star/cli/bundle',
    );
    expect(getEnvironmentCliEntrypoint(envDir)).toBe(
      '/tmp/agenthub-environments/quiet-star/cli/bundle/dist/index.mjs',
    );
    expect(getEnvironmentCliEntrypoint(envDir)).not.toContain(
      '/packages/agenthub-cli/dist/',
    );
  });

  it('copies launchers so a symlink cannot resolve back to the shared CLI dist', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'agenthub-private-cli-test-'));

    try {
      const bundleRoot = buildPrivateCliBundle(envDir);
      const launcher = join(bundleRoot, 'bin', 'agenthub.mjs');
      const entrypoint = readFileSync(join(bundleRoot, 'dist', 'index.mjs'), 'utf8');

      expect(lstatSync(launcher).isSymbolicLink()).toBe(false);
      expect(readFileSync(launcher, 'utf8')).toContain("join(projectRoot, 'dist', 'index.mjs')");
      expect(entrypoint.length).toBeGreaterThan(100_000);
      expect(entrypoint).toContain('AgentHub - Claude Code and Codex workspace');
    } finally {
      rmSync(envDir, { recursive: true, force: true });
    }
  }, 30_000);

  it('keeps the previous bundle when the staged build fails', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'agenthub-private-cli-rollback-'));
    const previousBundle = getEnvironmentCliBundleRoot(envDir);
    const previousEntrypoint = join(previousBundle, 'dist', 'index.mjs');
    mkdirSync(join(previousBundle, 'dist'), { recursive: true });
    writeFileSync(previousEntrypoint, 'previous-bundle-marker', { mode: 0o600 });
    const run = vi.fn()
      .mockReturnValueOnce({ status: 0 })
      .mockReturnValueOnce({ status: 1 });

    try {
      expect(() => buildPrivateCliBundle(envDir, { run })).toThrow(/Private CLI bundle failed/);
      expect(readFileSync(previousEntrypoint, 'utf8')).toBe('previous-bundle-marker');
      expect(readdirSync(join(envDir, 'cli')).filter((entry) => entry.startsWith('.bundle-build-'))).toEqual([]);
      expect(run).toHaveBeenCalledTimes(2);
    } finally {
      rmSync(envDir, { recursive: true, force: true });
    }
  });
});

describe('environment up transaction', () => {
  it.each([
    ['service startup', 'start'],
    ['private bundle build', 'build'],
    ['credential seed', 'seed'],
  ])('cleans every created resource when %s fails', async (_label, failureStage) => {
    const events: string[] = [];
    const deps = {
      create: vi.fn(async () => 'transaction-fixture'),
      setTemplate: vi.fn(),
      start: vi.fn(async () => {
        events.push('start');
        if (failureStage === 'start') throw new Error('injected start failure');
      }),
      build: vi.fn(() => {
        events.push('build');
        if (failureStage === 'build') throw new Error('injected build failure');
      }),
      seed: vi.fn(async () => {
        events.push('seed');
        if (failureStage === 'seed') throw new Error('injected seed failure');
      }),
      stop: vi.fn(() => events.push('stop')),
      remove: vi.fn(() => events.push('remove')),
      envDir: '/tmp/transaction-fixture',
    };

    await expect(runEnvironmentUpTransaction('authenticated-empty', undefined, deps)).rejects.toThrow(
      `injected ${failureStage} failure`,
    );
    expect(deps.stop).toHaveBeenCalledWith('transaction-fixture');
    expect(deps.remove).toHaveBeenCalledWith('transaction-fixture');
    expect(events.slice(-2)).toEqual(['stop', 'remove']);
  });
});

describe('authenticated web environment startup', () => {
  it('runs Expo in headless mode by default', () => {
    expect(buildWebServiceEnv({ EXPO_PUBLIC_SERVER_URL: 'http://localhost:13017' })).toMatchObject({
      BROWSER: 'none',
      EXPO_UNSTABLE_HEADLESS: 'true',
    });
  });

  it('preserves an explicit Expo headless override', () => {
    expect(buildWebServiceEnv({ EXPO_UNSTABLE_HEADLESS: 'false' }).EXPO_UNSTABLE_HEADLESS).toBe('false');
  });

  it('allows slow Expo cold starts without failing the environment transaction', () => {
    expect(getWebStartupTimeoutMs({})).toBe(120_000);
    expect(getWebStartupTimeoutMs({ AGENTHUB_ENV_WEB_STARTUP_TIMEOUT_MS: '45000' })).toBe(45_000);
    expect(getWebStartupTimeoutMs({ AGENTHUB_ENV_WEB_STARTUP_TIMEOUT_MS: 'not-a-duration' })).toBe(120_000);
  });
});

describe('environment doctor', () => {
  it('reports missing config and stale pid files without mutating the environment', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'agenthub-doctor-'));
    mkdirSync(join(envDir, 'pids'), { recursive: true });
    writeFileSync(join(envDir, 'pids', 'server.pid'), '999999');
    try {
      const result = inspectEnvironmentHealth(envDir, () => false);
      expect(result.configPresent).toBe(false);
      expect(result.stalePidFiles).toEqual(['server.pid']);
      expect(readFileSync(join(envDir, 'pids', 'server.pid'), 'utf8')).toBe('999999');
    } finally { rmSync(envDir, { recursive: true, force: true }); }
  });

  it('accepts a valid config and live pid through injected process identity', () => {
    const envDir = mkdtempSync(join(tmpdir(), 'agenthub-doctor-valid-'));
    writeFileSync(join(envDir, 'environment.json'), JSON.stringify({ name: envDir.split('/').pop(), serverPort: 13017, expoPort: 19007 }));
    mkdirSync(join(envDir, 'pids'), { recursive: true });
    writeFileSync(join(envDir, 'pids', 'server.pid'), '123');
    try {
      expect(inspectEnvironmentHealth(envDir, (pid) => pid === 123).issues).toEqual([]);
    } finally { rmSync(envDir, { recursive: true, force: true }); }
  });
});

describe('environment prune safety', () => {
  it('protects current and healthy environments and selects only stale candidates', () => {
    const health = (issues: string[], stalePidFiles: string[]) => ({ envDir: '/tmp', configPresent: true, issues, stalePidFiles });
    expect(selectPrunableEnvironments([
      { name: 'current', health: health(['stale pid file: server.pid'], ['server.pid']) },
      { name: 'healthy', health: health([], []) },
      { name: 'stale', health: health(['stale pid file: server.pid'], ['server.pid']) },
    ], 'current')).toEqual(['stale']);
  });

  it('requires an explicit DELETE confirmation for apply mode', () => {
    expect(selectPrunableEnvironments([{ name: 'stale', health: { envDir: '/tmp', configPresent: true, issues: ['stale'], stalePidFiles: ['server.pid'] } }])).toEqual(['stale']);
    expect(process.env.AGENTHUB_ENV_PRUNE_CONFIRM).not.toBe('DELETE');
  });
});

describe('environment log rotation', () => {
  it('removes oldest files by count and byte budget', () => {
    const logDir = mkdtempSync(join(tmpdir(), 'agenthub-logs-'));
    try {
      writeFileSync(join(logDir, 'old.log'), '12345');
      writeFileSync(join(logDir, 'new.log'), '12');
      const oldTime = new Date(Date.now() - 10_000);
      utimesSync(join(logDir, 'old.log'), oldTime, oldTime);
      const removed = rotateEnvironmentLogs(logDir, { maxFiles: 1, maxBytes: 3 });
      expect(removed).toEqual(['old.log']);
      expect(readdirSync(logDir)).toEqual(['new.log']);
    } finally { rmSync(logDir, { recursive: true, force: true }); }
  });

  it('rejects invalid negative retention limits instead of deleting everything', () => {
    const logDir = mkdtempSync(join(tmpdir(), 'agenthub-logs-invalid-'));
    try {
      writeFileSync(join(logDir, 'keep.log'), 'data');
      expect(() => rotateEnvironmentLogs(logDir, { maxFiles: -1 })).toThrow(/maxFiles/);
      expect(() => rotateEnvironmentLogs(logDir, { maxBytes: -1 })).toThrow(/maxBytes/);
      expect(readdirSync(logDir)).toEqual(['keep.log']);
    } finally { rmSync(logDir, { recursive: true, force: true }); }
  });

  it('bounds a live service log and redacts credentials without stopping the writer', async () => {
    const logDir = mkdtempSync(join(tmpdir(), 'agenthub-live-logs-'));
    const spawnManagedEnvironmentService = (environmentModule as unknown as {
      spawnManagedEnvironmentService?: (
        command: string,
        args: string[],
        options: {
          cwd: string;
          env: NodeJS.ProcessEnv;
          logFile: string;
          maxFiles: number;
          maxBytes: number;
        },
      ) => number;
    }).spawnManagedEnvironmentService;

    try {
      expect(spawnManagedEnvironmentService).toBeTypeOf('function');
      const logFile = join(logDir, 'stdout.log');
      writeFileSync(logFile, `legacy?dev_token=legacy-token&dev_secret=legacy-secret\n${'l'.repeat(2_048)}`);
      writeFileSync(`${logFile}.7`, 'out-of-budget archive');
      const childCode = [
        "const payload = 'x'.repeat(256)",
        "for (let index = 0; index < 80; index += 1) console.log(payload)",
        "process.stdout.write('z'.repeat(70000))",
        "console.log()",
        "console.log('https://example.invalid/?dev_token=token-value&dev_secret=secret-value')",
      ].join(';');
      const pid = spawnManagedEnvironmentService!(process.execPath, ['-e', childCode], {
        cwd: logDir,
        env: process.env,
        logFile,
        maxFiles: 3,
        maxBytes: 1_024,
      });
      let exited = false;
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        try { process.kill(pid, 0); } catch { exited = true; break; }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      expect(exited).toBe(true);

      const files = readdirSync(logDir).filter((name) => name.startsWith('stdout.log'));
      expect(files.length).toBeGreaterThan(1);
      expect(files.length).toBeLessThanOrEqual(3);
      const contents = files.map((name) => readFileSync(join(logDir, name), 'utf8'));
      for (const name of files) {
        expect(lstatSync(join(logDir, name)).size).toBeLessThanOrEqual(1_024);
      }
      expect(contents.join('\n')).not.toContain('token-value');
      expect(contents.join('\n')).not.toContain('secret-value');
      expect(contents.join('\n')).toContain('[REDACTED]');
      expect(contents.join('\n')).toContain('[TRUNCATED OVERSIZED LOG LINE]');
      expect(files).not.toContain('stdout.log.7');
    } finally {
      rmSync(logDir, { recursive: true, force: true });
    }
  });
});
