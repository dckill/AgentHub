const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');

test('accepts only a complete passing plan-mode integration log', () => {
  const { DEFAULT_SCENARIOS, checkPlanModeOutput } = require('./checkPlanModeOutput.cjs');
  const output = DEFAULT_SCENARIOS
    .map((scenario) => ` ✓ Plan Mode Integration > ${scenario}`)
    .join('\n');

  assert.deepEqual(checkPlanModeOutput(output), []);
});

test('rejects skipped, missing, or contradictory plan-mode scenarios', () => {
  const { DEFAULT_SCENARIOS, checkPlanModeOutput } = require('./checkPlanModeOutput.cjs');
  const [passedAndSkipped, skipped] = DEFAULT_SCENARIOS;
  const output = [
    ` ✓ Plan Mode Integration > ${passedAndSkipped}`,
    ` ↓ Plan Mode Integration > ${passedAndSkipped}`,
    ` ↓ Plan Mode Integration > ${skipped}`,
    ' Tests 1 passed | 2 skipped',
  ].join('\n');

  assert.deepEqual(checkPlanModeOutput(output), [
    `plan-mode scenario both passed and skipped: ${passedAndSkipped}`,
    `plan-mode scenario skipped: ${skipped}`,
    `plan-mode scenario missing pass: ${DEFAULT_SCENARIOS[2]}`,
  ]);
});

test('keeps the exact plan approval, denial, and stale bypass regression scenarios', () => {
  const { DEFAULT_SCENARIOS } = require('./checkPlanModeOutput.cjs');
  assert.deepEqual(DEFAULT_SCENARIOS, [
    'should call canCallTool for ExitPlanMode and allow plan execution',
    'should deny plan and not modify files',
    'should always call canCallTool for ExitPlanMode even after bypassPermissions was active',
  ]);
});

test('wires plan mode into the CLI integration command and protected provider gate', () => {
  const cliPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages/agenthub-cli/package.json'), 'utf8'));
  const integrationCommand = cliPackage.scripts['test:integration'];
  const ci = fs.readFileSync(path.join(repoRoot, '.gitlab-ci.yml'), 'utf8');
  const providerJob = ci.match(/cli:provider-matrix:[\s\S]*?(?=\n(?:[^ \n#]|#)|$)/)?.[0] ?? '';

  assert.match(integrationCommand, /--project integration-plan-mode/);
  assert.match(providerJob, /CLAUDE_CODE_OAUTH_TOKEN/);
  assert.match(providerJob, /ANTHROPIC_API_KEY/);
  assert.match(providerJob, /--project integration-plan-mode src\/claude\/planMode\.integration\.test\.ts/);
  assert.match(providerJob, /reports\/provider\/plan-mode\.log/);
  assert.match(providerJob, /node scripts\/checkPlanModeOutput\.cjs reports\/provider\/plan-mode\.log/);
  assert.match(providerJob, /artifacts:[\s\S]*reports\/provider\/plan-mode\.log/);
});
