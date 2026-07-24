const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULT_SCENARIOS, checkProviderMatrixOutput } = require('./checkProviderMatrixOutput.cjs');

const required = [
  'archives the real runner',
  'archives the real Claude runner',
];

test('accepts a matrix log when every required scenario has a passing line', () => {
  const output = required.map((name) => ` ✓ Daemon Integration Tests > ${name}`).join('\\n')
    + '\\n Test Files 1 passed';
  assert.deepEqual(checkProviderMatrixOutput(output, required), []);
});

test('rejects a missing or skipped provider scenario while ignoring non-target Vitest skips', () => {
  const output = [
    ' ✓ Daemon Integration Tests > archives the real runner',
    ' ↓ Daemon Integration Tests > archives the real Claude runner',
    ' Tests 1 passed | 25 skipped',
  ].join('\\n');
  const errors = checkProviderMatrixOutput(output, required);
  assert.equal(errors.some((error) => error.includes('Claude')), true);
});

test('rejects a provider scenario that reports both a pass and a skip', () => {
  const output = [
    ' ✓ Daemon Integration Tests > archives the real runner',
    ' ↓ Daemon Integration Tests > archives the real runner',
  ].join('\\n');
  assert.deepEqual(
    checkProviderMatrixOutput(output, ['archives the real runner']),
    ['provider scenario both passed and skipped: archives the real runner'],
  );
});

test('default protected matrix distinguishes real idle and active provider phases', () => {
  assert.deepEqual(DEFAULT_SCENARIOS, [
    'archives the real runner and session after its app-server child is SIGKILLed',
    'closes an active Codex turn before archiving when its app-server child is SIGKILLed',
    'stops a real idle Claude runner before backend startup without inventing a turn',
    'archives the real Claude runner when its SDK child is SIGKILLed',
  ]);
});
