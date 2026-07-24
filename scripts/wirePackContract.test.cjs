const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const repositoryRoot = path.resolve(__dirname, '..');
const wirePackageRoot = path.join(repositoryRoot, 'packages/agenthub-wire');
const pnpmArgs = ['--offline', '--yes', 'pnpm@10.11.0'];

function runPnpm(args, options = {}) {
  return execFileSync('npx', [...pnpmArgs, ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

function packPackage(packageName, destination) {
  const output = runPnpm([
    '--filter',
    packageName,
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

function packDirectory(packageRoot, destination) {
  const output = runPnpm([
    '--dir',
    packageRoot,
    'pack',
    '--pack-destination',
    destination,
    '--json',
  ]);
  const result = JSON.parse(output);
  const packed = Array.isArray(result) ? result[0] : result;
  assert.ok(packed?.filename, `pnpm pack did not report a filename: ${output}`);
  return path.resolve(packageRoot, packed.filename);
}

function readPackedPackageJson(tarball, destination) {
  fs.mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-xzf', tarball, '-C', destination, 'package/package.json']);
  return JSON.parse(fs.readFileSync(path.join(destination, 'package/package.json'), 'utf8'));
}

test('published Wire tarball preserves ESM, CJS, and TypeScript contracts in a clean install', {
  timeout: 120_000,
}, () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-wire-pack-'));

  try {
    runPnpm(['--filter', '@artsum/agenthub-wire', 'build']);
    const wireTarball = packPackage('@artsum/agenthub-wire', temporaryRoot);
    const cuidPackageRoot = fs.realpathSync(path.join(
      wirePackageRoot,
      'node_modules/@paralleldrive/cuid2',
    ));
    const dependencyTarballs = {
      '@paralleldrive/cuid2': packDirectory(cuidPackageRoot, temporaryRoot),
      '@noble/hashes': packDirectory(
        path.dirname(require.resolve('@noble/hashes/crypto', { paths: [cuidPackageRoot] })),
        temporaryRoot,
      ),
      zod: packDirectory(
        fs.realpathSync(path.join(wirePackageRoot, 'node_modules/zod')),
        temporaryRoot,
      ),
    };

    const localDependencies = Object.fromEntries([
      ['@artsum/agenthub-wire', wireTarball],
      ...Object.entries(dependencyTarballs),
    ].map(([name, tarball]) => [name, `file:${tarball}`]));
    fs.writeFileSync(path.join(temporaryRoot, 'package.json'), JSON.stringify({
      name: 'agenthub-wire-pack-contract',
      private: true,
      type: 'module',
      dependencies: localDependencies,
      pnpm: {
        overrides: Object.fromEntries(Object.entries(dependencyTarballs)
          .map(([name, tarball]) => [name, `file:${tarball}`])),
      },
    }));
    runPnpm([
      '--dir',
      temporaryRoot,
      'install',
      '--offline',
      '--ignore-scripts',
    ]);

    execFileSync(process.execPath, [
      '--input-type=module',
      '--eval',
      "import { parseRpcRequest, rpcMethodNames } from '@artsum/agenthub-wire'; if (!rpcMethodNames.includes('readFile')) throw new Error('missing readFile'); parseRpcRequest('readFile', { path: '/tmp/example' });",
    ], { cwd: temporaryRoot, stdio: 'pipe' });
    execFileSync(process.execPath, [
      '--input-type=commonjs',
      '--eval',
      "const { parseRpcResponse } = require('@artsum/agenthub-wire'); if (parseRpcResponse('abort', null) !== null) throw new Error('invalid abort response');",
    ], { cwd: temporaryRoot, stdio: 'pipe' });

    fs.writeFileSync(path.join(temporaryRoot, 'contract.ts'), [
      "import { parseRpcRequest, type RpcMethodName } from '@artsum/agenthub-wire';",
      "const method: RpcMethodName = 'readFile';",
      "parseRpcRequest(method, { path: '/tmp/example' });",
      '',
    ].join('\n'));
    fs.writeFileSync(path.join(temporaryRoot, 'tsconfig.json'), JSON.stringify({
      compilerOptions: {
        module: 'NodeNext',
        moduleResolution: 'NodeNext',
        noEmit: true,
        strict: true,
        skipLibCheck: true,
      },
      include: ['contract.ts'],
    }));
    execFileSync(path.join(repositoryRoot, 'node_modules/.bin/tsc'), ['-p', 'tsconfig.json'], {
      cwd: temporaryRoot,
      stdio: 'pipe',
    });
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test('consumer tarballs replace workspace protocol with the published Wire version', () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-consumer-pack-'));

  try {
    for (const packageName of ['@artsum/agenthub', 'agenthub-agent']) {
      const tarball = packPackage(packageName, temporaryRoot);
      const manifest = readPackedPackageJson(
        tarball,
        path.join(temporaryRoot, packageName.replaceAll('/', '-').replaceAll('@', '')),
      );
      assert.equal(manifest.dependencies['@artsum/agenthub-wire'], '1.0.0');
      assert.doesNotMatch(JSON.stringify(manifest), /workspace:/);
    }
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
});
