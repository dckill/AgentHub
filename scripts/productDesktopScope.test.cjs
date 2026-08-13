const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');

test('Expo Web/Tauri is the only active desktop product direction', () => {
  assert.equal(fs.existsSync(path.join(repoRoot, 'packages/codium')), false);
  assert.doesNotMatch(read('pnpm-workspace.yaml'), /packages\/codium/);
  assert.doesNotMatch(read('package.json'), /packages\/codium|"codium"\s*:/);
  assert.doesNotMatch(read('pnpm-lock.yaml'), /packages\/codium:/);
  for (const currentDocument of [
    'README.md',
    'docs/README.md',
    'docs/project-status.md',
    'docs/architecture.md',
    'docs/dev-environments.md',
  ]) {
    assert.doesNotMatch(read(currentDocument), /\bCodium\b|packages\/codium|pnpm codium/);
  }
});
