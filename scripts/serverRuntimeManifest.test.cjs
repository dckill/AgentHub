const assert = require('node:assert/strict');
const fs = require('node:fs');
const moduleBuiltin = require('node:module');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');

const repoRoot = path.resolve(__dirname, '..');
const serverRoot = path.join(repoRoot, 'packages/agenthub-server');
const runtimeRoot = path.join(repoRoot, 'packages/agenthub-server-runtime');

test('compiled Server externals are exactly declared by the minimal runtime importer', () => {
  const build = spawnSync('node', [path.join(serverRoot, 'scripts/buildRuntime.mjs')], {
    cwd: serverRoot,
    encoding: 'utf8',
  });
  assert.equal(build.status, 0, `${build.stdout}\n${build.stderr}`);

  const manifest = JSON.parse(fs.readFileSync(path.join(runtimeRoot, 'package.json'), 'utf8'));
  const builtins = new Set([...moduleBuiltin.builtinModules, ...moduleBuiltin.builtinModules.map((name) => `node:${name}`)]);
  const externals = new Set();
  for (const entrypoint of ['main.mjs', 'standalone.mjs']) {
    const output = fs.readFileSync(path.join(serverRoot, 'dist/runtime', entrypoint), 'utf8');
    for (const match of output.matchAll(/(?:from\s+|import\s*\(?)(['"])([^'"]+)\1/g)) {
      const specifier = match[2];
      if (!specifier.startsWith('.') && !builtins.has(specifier)) externals.add(specifier);
    }
  }

  const declared = new Set(Object.keys(manifest.dependencies ?? {}));
  const runtimeOnlyDynamicDependencies = new Set(['pino-pretty']);
  assert.deepEqual(
    [...declared].filter((name) => !runtimeOnlyDynamicDependencies.has(name)).sort(),
    [...externals].sort(),
  );
  for (const name of runtimeOnlyDynamicDependencies) assert.ok(declared.has(name), `${name} must be declared`);
});
