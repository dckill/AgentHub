const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  summarize,
  evaluateGates,
} = require('./runAppPerformanceBaseline.cjs');

test('summarize reports min, median and max without changing samples', () => {
  const values = [5, 1, 3, 2, 4];
  assert.deepEqual(summarize(values), { min: 1, median: 3, max: 5 });
  assert.deepEqual(values, [5, 1, 3, 2, 4]);
});

test('performance baseline gate requires the fixed fixtures and every run to meet ratios', () => {
  const messageRuns = Array.from({ length: 5 }, () => ({
    historyMessages: 10_000,
    iterations: 200,
    p95ImprovementPercent: 90,
  }));
  const inactiveRuns = Array.from({ length: 5 }, () => ({
    inactiveSessions: 50,
    messagesPerSession: 10_000,
    maxRetainedInactive: 20,
    retainedSessions: 20,
    reclaimedPercent: 59,
  }));

  assert.deepEqual(evaluateGates(messageRuns, inactiveRuns, 5), {
    exactlyRequestedRuns: true,
    allFixtureStable: true,
    allP95ImprovementAtLeast75Percent: true,
    allReclaimedAtLeast50Percent: true,
    passed: true,
  });

  messageRuns[4] = { ...messageRuns[4], p95ImprovementPercent: 74.9 };
  assert.equal(evaluateGates(messageRuns, inactiveRuns, 5).passed, false);
});

test('root scripts expose the baseline and require its deterministic contract in ci:verify', () => {
  const rootPackage = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(rootPackage.scripts['app:perf:baseline'], 'node scripts/runAppPerformanceBaseline.cjs');
  assert.equal(rootPackage.scripts['app:perf:baseline:test'], 'node --test scripts/appPerformanceBaseline.test.cjs');
  assert.match(rootPackage.scripts['ci:verify'], /pnpm app:perf:baseline:test/);
  assert.doesNotMatch(rootPackage.scripts['ci:verify'], /pnpm app:perf:baseline(?:\s|&&)/);
});
