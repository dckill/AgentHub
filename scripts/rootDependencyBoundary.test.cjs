const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const yaml = require('yaml');

test('workspace root does not expose a production dependency snapshot', () => {
  const manifest = require('../package.json');
  assert.deepEqual(manifest.dependencies, {}, 'root runtime dependencies must remain empty; declare tooling under devDependencies');
  assert.ok(Object.keys(manifest.devDependencies || {}).length <= 20, 'root devDependencies must stay a small explicit tooling set');
});

test('workspace install does not expose undeclared dependencies through hoisting or automatic peers', () => {
  const npmrc = Object.fromEntries(
    fs.readFileSync(path.resolve(__dirname, '..', '.npmrc'), 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => line.split('=', 2)),
  );

  assert.equal(npmrc['node-linker'], 'isolated');
  assert.equal(npmrc['shamefully-hoist'], 'false');
  assert.equal(npmrc.hoist, 'false');
  assert.equal(npmrc['auto-install-peers'], 'false');
  assert.equal(npmrc['strict-peer-dependencies'], 'true');

  const workspace = yaml.parse(
    fs.readFileSync(path.resolve(__dirname, '..', 'pnpm-workspace.yaml'), 'utf8'),
  );
  assert.deepEqual(
    workspace.peerDependencyRules,
    { ignoreMissing: ['@types/react-native'] },
    'only the obsolete React Native type stub may be ignored; all real peers stay strict',
  );
});
