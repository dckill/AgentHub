const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');
const limits = new Map([
  ['packages/agenthub-app/sources/sync/sync.ts', 1320],
  ['packages/agenthub-app/sources/sync/storage.ts', 1320],
  ['packages/agenthub-app/sources/sync/reducer/reducer.ts', 1210],
  ['packages/agenthub-app/sources/sync/ops.ts', 1000],
  ['packages/agenthub-app/sources/app/(app)/new/index.tsx', 1800],
  ['packages/agenthub-cli/src/codex/runCodex.ts', 1250],
  ['packages/agenthub-cli/src/codex/codexAppServerClient.ts', 870],
  ['packages/agenthub-app/sources/components/AgentInput.tsx', 700],
]);

test('core facades stay within their explicit responsibility budgets', () => {
  const violations = [];
  for (const [relativePath, maximum] of limits) {
    const lines = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8').split('\n').length;
    if (lines > maximum) violations.push({ path: relativePath, lines, maximum });
  }
  assert.deepEqual(violations, []);
});
