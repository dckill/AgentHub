const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { summarizeReachability, evaluateReachability, writeReachabilityReport } = require('./checkReachableAudit.cjs');

test('collects reachable paths for high and critical advisories', () => {
  const summary = summarizeReachability({ advisories: {
    '1': { module_name: 'danger-high', severity: 'high', findings: [{ paths: ['.>app>danger-high'] }] },
    '2': { module_name: 'safe-low', severity: 'low', findings: [{ paths: ['.>safe-low'] }] },
  } });
  assert.deepEqual(summary, { high: [{ id: '1', module: 'danger-high', paths: ['.>app>danger-high'] }], critical: [] });
  assert.equal(evaluateReachability(summary), false);
});

test('passes only when no reachable high or critical path exists', () => {
  const summary = summarizeReachability({ advisories: { '1': { module_name: 'moderate', severity: 'moderate', findings: [{ paths: ['.>moderate'] }] } } });
  assert.equal(evaluateReachability(summary), true);
});

test('rejects malformed advisory data', () => {
  assert.throws(() => summarizeReachability({}), /advisories/);
});

test('writes a standalone private JSON artifact without lifecycle output', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'agenthub-reachability-'));
  const output = path.join(directory, 'reachable-high-critical.json');
  try {
    writeReachabilityReport(output, { high: [], critical: [], passed: true });
    assert.deepEqual(JSON.parse(fs.readFileSync(output, 'utf8')), {
      high: [],
      critical: [],
      passed: true,
    });
    assert.equal(fs.statSync(output).mode & 0o777, 0o600);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
