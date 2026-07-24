const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const cliRoot = path.join(repositoryRoot, 'packages/agenthub-cli');
const pnpmArgs = ['--offline', '--yes', 'pnpm@10.11.0'];

function runPnpm(args, options = {}) {
  return execFileSync('npx', [...pnpmArgs, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function runRegistryPnpm(args, options = {}) {
  return execFileSync('npx', ['--yes', 'pnpm@10.11.0', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function packCli(destination) {
  const output = runPnpm([
    '--filter',
    '@artsum/agenthub',
    'pack',
    '--pack-destination',
    destination,
    '--json',
  ]);
  const result = JSON.parse(output);
  const packed = Array.isArray(result) ? result[0] : result;
  assert.ok(packed?.filename, `pnpm pack did not report a filename: ${output}`);
  return path.resolve(repositoryRoot, packed.filename);
}

function makeTreeReadOnly(root) {
  if (!fs.existsSync(root)) return;
  const stats = fs.lstatSync(root);
  if (stats.isDirectory()) {
    for (const entry of fs.readdirSync(root)) makeTreeReadOnly(path.join(root, entry));
    fs.chmodSync(root, 0o555);
  } else if (stats.isFile()) {
    fs.chmodSync(root, stats.mode & 0o111 ? 0o555 : 0o444);
  }
}

function makeTreeRemovable(root) {
  if (!fs.existsSync(root)) return;
  const stats = fs.lstatSync(root);
  if (stats.isDirectory()) {
    fs.chmodSync(root, 0o755);
    for (const entry of fs.readdirSync(root)) makeTreeRemovable(path.join(root, entry));
  } else if (stats.isFile()) {
    fs.chmodSync(root, stats.mode & 0o111 ? 0o755 : 0o644);
  }
}

function currentPlatformDir() {
  const values = {
    'darwin-arm64': 'arm64-darwin',
    'darwin-x64': 'x64-darwin',
    'linux-arm64': 'arm64-linux',
    'linux-x64': 'x64-linux',
    'win32-arm64': 'arm64-win32',
    'win32-x64': 'x64-win32',
  };
  const value = values[`${process.platform}-${process.arch}`];
  assert.ok(value, `unsupported pack smoke platform: ${process.arch}-${process.platform}`);
  return value;
}

test('published CLI tarball installs and executes from a clean registry-backed consumer', {
  timeout: 180_000,
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-cli-pack-'));
  const consumerRoot = path.join(temporaryRoot, 'consumer');
  const isolatedHome = path.join(temporaryRoot, 'home');
  let installedPackage;

  try {
    for (const requiredBuildFile of [
      'dist/index.mjs',
      'dist/codex/agenthubMcpStdioBridge.mjs',
    ]) {
      assert.ok(fs.existsSync(path.join(cliRoot, requiredBuildFile)), `CLI build output is missing: ${requiredBuildFile}`);
    }

    const tarball = packCli(temporaryRoot);
    const packedBytes = fs.statSync(tarball).size;
    const entries = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8' }).trim().split('\n');

    for (const requiredEntry of [
      'package/package.json',
      'package/bin/agenthub.mjs',
      'package/bin/agenthub-mcp.mjs',
      'package/dist/index.mjs',
      'package/dist/codex/agenthubMcpStdioBridge.mjs',
      'package/scripts/unpack-tools.cjs',
      'package/tools/archives/difftastic-x64-linux.tar.gz',
      'package/tools/archives/ripgrep-x64-linux.tar.gz',
    ]) {
      assert.ok(entries.includes(requiredEntry), `published CLI tarball is missing ${requiredEntry}`);
    }
    assert.equal(entries.some((entry) => entry.startsWith('package/tools/unpacked/')), false,
      'published CLI tarball must not duplicate locally unpacked platform tools');
    assert.ok(packedBytes <= 105 * 1024 * 1024, `CLI tarball exceeds 105 MiB: ${packedBytes} bytes`);

    fs.mkdirSync(consumerRoot, { recursive: true });
    fs.mkdirSync(isolatedHome, { recursive: true });
    fs.writeFileSync(path.join(consumerRoot, 'package.json'), `${JSON.stringify({
      name: 'agenthub-cli-pack-consumer',
      private: true,
      dependencies: { '@artsum/agenthub': `file:${tarball}` },
    }, null, 2)}\n`, { mode: 0o600 });
    runRegistryPnpm(['--dir', consumerRoot, 'install']);

    installedPackage = path.join(consumerRoot, 'node_modules/@artsum/agenthub');
    fs.rmSync(path.join(installedPackage, 'tools/unpacked'), { recursive: true, force: true });
    makeTreeReadOnly(installedPackage);

    const binDirectory = path.join(consumerRoot, 'node_modules/.bin');
    const agenthub = path.join(binDirectory, process.platform === 'win32' ? 'agenthub.CMD' : 'agenthub');
    const agenthubMcp = path.join(binDirectory, process.platform === 'win32' ? 'agenthub-mcp.CMD' : 'agenthub-mcp');
    const environment = {
      ...process.env,
      HOME: isolatedHome,
      AGENTHUB_HOME_DIR: path.join(isolatedHome, '.agenthub'),
      AGENTHUB_HTTP_MCP_URL: '',
    };

    const directVersion = execFileSync(process.execPath, [path.join(installedPackage, 'dist/index.mjs'), '--version'], {
      cwd: consumerRoot,
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    assert.equal(directVersion, `agenthub version: ${require(path.join(cliRoot, 'package.json')).version}`);

    const help = execFileSync(agenthub, ['--help'], {
      cwd: consumerRoot,
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.match(help, /AgentHub/);

    const mcp = spawnSync(agenthubMcp, [], {
      cwd: consumerRoot,
      env: environment,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    assert.equal(mcp.status, 2);
    assert.match(mcp.stderr, /Missing target URL/);

    const installedTools = path.join(
      environment.AGENTHUB_HOME_DIR,
      'tools',
      require(path.join(cliRoot, 'package.json')).version,
      currentPlatformDir(),
      'unpacked',
    );
    const expectedTools = process.platform === 'win32'
      ? ['difft.exe', 'rg.exe', 'ripgrep.node']
      : ['difft', 'rg', 'ripgrep.node'];
    for (const tool of expectedTools) {
      assert.ok(fs.existsSync(path.join(installedTools, tool)), `first use did not prepare ${tool} in the user cache`);
    }
    if (process.platform !== 'win32') {
      for (const executable of ['difft', 'rg']) {
        assert.notEqual(fs.statSync(path.join(installedTools, executable)).mode & 0o100, 0,
          `${executable} lost its executable bit after the second CLI startup`);
      }
    }
    assert.equal(fs.readFileSync(path.join(installedTools, '.platform'), 'utf8'), `${currentPlatformDir()}\n`);
    assert.equal(fs.existsSync(path.join(installedPackage, 'tools/unpacked')), false,
      'runtime must not require writes to a read-only installed package');
  } finally {
    if (installedPackage) makeTreeRemovable(installedPackage);
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
