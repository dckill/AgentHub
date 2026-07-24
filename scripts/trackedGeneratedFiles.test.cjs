const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const test = require('node:test');

test('generated app build artifacts are not tracked', () => {
  const tracked = execFileSync('git', ['ls-files', '--', 'packages/agenthub-app/build'], { encoding: 'utf8' }).trim();
  assert.equal(tracked, '', `tracked generated build files remain:\n${tracked}`);
});
