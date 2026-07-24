const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { summarizeAudit, evaluateThreshold } = require('./checkDependencyAudit.cjs');

test('normalizes pnpm audit metadata and passes when critical/high are zero', () => {
  const summary = summarizeAudit({
    metadata: {
      vulnerabilities: { info: 0, low: 7, moderate: 37, high: 0, critical: 0 },
      dependencies: 2389,
    },
  });
  assert.deepEqual(summary, {
    dependencies: 2389,
    vulnerabilities: { info: 0, low: 7, moderate: 37, high: 0, critical: 0 },
  });
  assert.equal(evaluateThreshold(summary, 'high'), true);
});

test('fails the threshold when high or critical findings exist', () => {
  const summary = summarizeAudit({ metadata: { vulnerabilities: { high: 1, critical: 0 } } });
  assert.equal(evaluateThreshold(summary, 'high'), false);
  assert.equal(evaluateThreshold(summarizeAudit({ metadata: { vulnerabilities: { high: 0, critical: 1 } } }), 'high'), false);
});

test('rejects malformed audit reports', () => {
  assert.throws(() => summarizeAudit({}), /metadata\.vulnerabilities/);
});

test('audit:check validates the supplied report without replacing it', () => {
  const repoRoot = path.resolve(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
  assert.equal(manifest.scripts['audit:check'], 'node scripts/checkDependencyAudit.cjs');

  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-audit-check-'));
  const report = path.join(directory, 'provider-audit.json');
  const fixture = JSON.stringify({ metadata: { vulnerabilities: { high: 0, critical: 0 }, dependencies: 37 } });
  fs.writeFileSync(report, fixture);
  const result = spawnSync(process.execPath, [path.join(repoRoot, 'scripts/checkDependencyAudit.cjs'), report, 'high'], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(report, 'utf8'), fixture);
  assert.equal(JSON.parse(result.stdout).dependencies, 37);
});
