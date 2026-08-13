const assert = require('node:assert/strict');
const test = require('node:test');

test('accepts an exact or improved coverage snapshot with the recorded test inventory', () => {
  const { checkAppCoverageBaseline } = require('./verifyAppCoverageBaseline.cjs');
  const baseline = {
    testFiles: 10,
    tests: 100,
    coverage: { statements: 40, lines: 40, branches: 80, functions: 50 },
  };
  assert.deepEqual(checkAppCoverageBaseline({
    baseline,
    actualCoverage: { statements: 40.1, lines: 40, branches: 81, functions: 50 },
    actualInventory: { testFiles: 10, tests: 100 },
  }), []);
});

test('rejects coverage regression and stale test inventory independently', () => {
  const { checkAppCoverageBaseline } = require('./verifyAppCoverageBaseline.cjs');
  const issues = checkAppCoverageBaseline({
    baseline: {
      testFiles: 10,
      tests: 100,
      coverage: { statements: 40, lines: 40, branches: 80, functions: 50 },
    },
    actualCoverage: { statements: 39.99, lines: 40, branches: 79.99, functions: 50 },
    actualInventory: { testFiles: 11, tests: 101 },
  });
  assert.deepEqual(issues.map((issue) => issue.code).sort(), [
    'coverage-regression',
    'coverage-regression',
    'test-file-count-drift',
    'test-count-drift',
  ].sort());
});
