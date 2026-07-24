const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { startLocalNpmRegistry } = require('./localNpmRegistry.cjs');

const repositoryRoot = path.resolve(__dirname, '..');
const cliRoot = path.join(repositoryRoot, 'packages/agenthub-cli');
const cliPackage = require(path.join(cliRoot, 'package.json'));
const baselineVersion = '1.0.2-drill.0';

function runCommand(executable, args, options) {
  return new Promise((resolve, reject) => {
    const detached = process.platform !== 'win32';
    const child = spawn(executable, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      detached,
      ...options,
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let forceKillTimer;
    child.stdout.on('data', (chunk) => stdout.push(chunk));
    child.stderr.on('data', (chunk) => stderr.push(chunk));
    const terminateTree = (signal) => {
      if (process.platform === 'win32') {
        if (signal === 'SIGTERM') spawn('taskkill', ['/pid', `${child.pid}`, '/t', '/f'], { stdio: 'ignore' }).unref();
        return;
      }
      try {
        process.kill(-child.pid, signal);
      } catch (error) {
        if (error.code !== 'ESRCH') throw error;
      }
    };
    const timer = setTimeout(() => {
      timedOut = true;
      terminateTree('SIGTERM');
      forceKillTimer = setTimeout(() => terminateTree('SIGKILL'), 5_000);
    }, 180_000);
    child.on('error', (error) => {
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      reject(error);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      clearTimeout(forceKillTimer);
      const output = Buffer.concat(stdout).toString('utf8');
      const errors = Buffer.concat(stderr).toString('utf8');
      if (code === 0 && !timedOut) {
        resolve(output);
        return;
      }
      reject(new Error(`${executable} ${args.join(' ')} failed (code=${code}, signal=${signal}, timedOut=${timedOut})\n${errors}\n${output}`));
    });
  });
}

function resolvePnpmCommand(environment = process.env, nodeExecutable = process.execPath) {
  const activePnpm = environment.npm_execpath;
  if (activePnpm && path.isAbsolute(activePnpm) && /^pnpm(?:\.c?js)?$/i.test(path.basename(activePnpm))) {
    return { executable: nodeExecutable, prefix: [activePnpm] };
  }
  return { executable: 'npx', prefix: ['--yes', 'pnpm@10.11.0'] };
}

test('release drill reuses the active pinned pnpm executable without an npm exec wrapper', () => {
  assert.deepEqual(
    resolvePnpmCommand({ npm_execpath: '/opt/corepack/pnpm/10.11.0/bin/pnpm.cjs' }, '/usr/bin/node'),
    {
      executable: '/usr/bin/node',
      prefix: ['/opt/corepack/pnpm/10.11.0/bin/pnpm.cjs'],
    },
  );
});

test('release installs reuse an explicit content store without caching mutable registry metadata', () => {
  assert.deepEqual(releaseInstallArgs('@artsum/agenthub@latest'), [
    'add', '@artsum/agenthub@latest', '--ignore-scripts',
  ]);
  const environment = createConsumerEnvironment(
    { PATH: '/usr/bin' },
    '/tmp/agenthub-home',
    '/var/cache/pnpm/store',
  );
  assert.equal(environment.HOME, '/tmp/agenthub-home');
  assert.equal(environment.CI, 'true');
  assert.equal(environment.PNPM_CONFIG_STORE_DIR, '/var/cache/pnpm/store');
  assert.equal(environment.npm_config_store_dir, '/var/cache/pnpm/store');
});

test('release drill routes dependency metadata and tarballs through the isolated registry', () => {
  assert.equal(buildNpmrc('http://127.0.0.1:4873/', 'release-token'), [
    'registry=http://127.0.0.1:4873/',
    '@artsum:registry=http://127.0.0.1:4873/',
    '//127.0.0.1:4873/:_authToken=release-token',
    '',
  ].join('\n'));
});

test('release install retries one transient registry failure with the same bounded command', async () => {
  let attempts = 0;
  const result = await runReleaseInstall('@artsum/agenthub@latest', { env: {} }, async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('ERR_SOCKET_TIMEOUT while fetching metadata');
    return 'installed';
  });
  assert.equal(result, 'installed');
  assert.equal(attempts, 2);
});

test('release install does not retry integrity or registry policy failures', async () => {
  let attempts = 0;
  await assert.rejects(() => runReleaseInstall('@artsum/agenthub@latest', { env: {} }, async () => {
    attempts += 1;
    throw new Error('ERR_PNPM_TARBALL_INTEGRITY');
  }), /ERR_PNPM_TARBALL_INTEGRITY/);
  assert.equal(attempts, 1);
});

function runPnpm(args, options) {
  const command = resolvePnpmCommand(options?.env);
  return runCommand(command.executable, [...command.prefix, ...args], options);
}

function releaseInstallArgs(packageSpec) {
  return ['add', packageSpec, '--ignore-scripts'];
}

function isTransientRegistryFailure(error) {
  return /ERR_SOCKET_TIMEOUT|ECONNRESET|ETIMEDOUT|EAI_AGAIN|timedOut=true/.test(error?.message || '');
}

async function runReleaseInstall(packageSpec, options, runner = runPnpm) {
  const args = releaseInstallArgs(packageSpec);
  try {
    return await runner(args, options);
  } catch (error) {
    if (!isTransientRegistryFailure(error)) throw error;
    return runner(args, options);
  }
}

function createConsumerEnvironment(environment, homeRoot, storeRoot) {
  if (!path.isAbsolute(homeRoot) || !path.isAbsolute(storeRoot)) {
    throw new Error('release drill home and pnpm store must be absolute paths');
  }
  return {
    ...environment,
    HOME: homeRoot,
    AGENTHUB_HOME_DIR: path.join(homeRoot, '.agenthub'),
    CI: 'true',
    PNPM_CONFIG_STORE_DIR: storeRoot,
    npm_config_store_dir: storeRoot,
  };
}

function buildNpmrc(registryUrl, token) {
  const registry = new URL(registryUrl);
  if (registry.protocol !== 'http:' || registry.hostname !== '127.0.0.1' || registry.pathname !== '/') {
    throw new Error(`release drill registry must be an isolated loopback URL, got ${registryUrl}`);
  }
  return [
    `registry=${registry.href}`,
    `@artsum:registry=${registry.href}`,
    `//${registry.host}/:_authToken=${token}`,
    '',
  ].join('\n');
}

async function resolvePnpmStorePath(environment) {
  const output = (await runPnpm(['store', 'path', '--silent'], {
    cwd: repositoryRoot,
    env: environment,
  })).trim();
  if (!path.isAbsolute(output) || output.includes('\n')) {
    throw new Error(`pnpm store path must be one absolute path, got ${JSON.stringify(output)}`);
  }
  const resolved = fs.realpathSync(output);
  if (!fs.statSync(resolved).isDirectory()) throw new Error(`pnpm store is not a directory: ${resolved}`);
  return resolved;
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
}

async function installedVersion(consumerRoot, environment) {
  const binary = path.join(
    consumerRoot,
    'node_modules/.bin',
    process.platform === 'win32' ? 'agenthub.CMD' : 'agenthub',
  );
  return (await runCommand(binary, ['--version'], {
    cwd: consumerRoot,
    env: environment,
  })).trim();
}

test('CLI publishes to an isolated registry, upgrades a clean consumer and rolls latest back', {
  timeout: 420_000,
}, async (t) => {
  assert.ok(fs.existsSync(path.join(cliRoot, 'dist/index.mjs')), 'CLI build output is required before the release drill');
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-registry-release-'));
  const token = crypto.randomBytes(32).toString('hex');
  const registry = await startLocalNpmRegistry({ token });
  t.after(async () => {
    await registry.close();
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  });

  const npmrc = path.join(temporaryRoot, '.npmrc');
  fs.writeFileSync(npmrc, buildNpmrc(registry.url, token), { mode: 0o600 });
  const environment = {
    ...process.env,
    NPM_CONFIG_USERCONFIG: npmrc,
    npm_config_userconfig: npmrc,
  };

  const baselineRoot = path.join(temporaryRoot, 'baseline');
  fs.mkdirSync(path.join(baselineRoot, 'bin'), { recursive: true, mode: 0o700 });
  writeJson(path.join(baselineRoot, 'package.json'), {
    name: cliPackage.name,
    version: baselineVersion,
    description: 'Synthetic previous release used only by the isolated rollback drill',
    type: 'module',
    bin: { agenthub: './bin/agenthub.mjs' },
  });
  const baselineBin = path.join(baselineRoot, 'bin/agenthub.mjs');
  fs.writeFileSync(baselineBin, `#!/usr/bin/env node\nconsole.log('agenthub version: ${baselineVersion}');\n`, { mode: 0o700 });

  await runPnpm([
    'publish', '--registry', registry.url, '--tag', 'latest', '--access', 'public',
    '--no-git-checks', '--ignore-scripts',
  ], { cwd: baselineRoot, env: environment });

  const consumerRoot = path.join(temporaryRoot, 'consumer');
  const homeRoot = path.join(temporaryRoot, 'home');
  fs.mkdirSync(consumerRoot, { recursive: true, mode: 0o700 });
  fs.mkdirSync(homeRoot, { recursive: true, mode: 0o700 });
  writeJson(path.join(consumerRoot, 'package.json'), { name: 'agenthub-release-drill-consumer', private: true });
  const sharedStoreRoot = await resolvePnpmStorePath(environment);
  const consumerEnvironment = createConsumerEnvironment(environment, homeRoot, sharedStoreRoot);

  await runReleaseInstall(`${cliPackage.name}@latest`, {
    cwd: consumerRoot, env: consumerEnvironment,
  });
  assert.equal(await installedVersion(consumerRoot, consumerEnvironment), `agenthub version: ${baselineVersion}`);

  await runPnpm([
    'publish', '--registry', registry.url, '--tag', 'latest', '--access', 'public',
    '--no-git-checks', '--ignore-scripts',
  ], { cwd: cliRoot, env: environment });
  await runReleaseInstall(`${cliPackage.name}@latest`, {
    cwd: consumerRoot, env: consumerEnvironment,
  });
  assert.equal(await installedVersion(consumerRoot, consumerEnvironment), `agenthub version: ${cliPackage.version}`);

  await runPnpm([
    'dist-tag', 'add', `${cliPackage.name}@${baselineVersion}`, 'latest', '--registry', registry.url,
  ], { cwd: repositoryRoot, env: environment });
  await runReleaseInstall(`${cliPackage.name}@latest`, {
    cwd: consumerRoot, env: consumerEnvironment,
  });
  assert.equal(await installedVersion(consumerRoot, consumerEnvironment), `agenthub version: ${baselineVersion}`);

  assert.deepEqual(registry.snapshot(), {
    packages: {
      [cliPackage.name]: {
        versions: [baselineVersion, cliPackage.version].sort(),
        tags: { latest: baselineVersion },
      },
    },
    publishCount: 2,
    tagMutationCount: 1,
  });
  assert.equal(fs.statSync(npmrc).mode & 0o777, 0o600);
});
