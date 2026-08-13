const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const COVERAGE_KEYS = ['statements', 'lines', 'branches', 'functions'];

function checkAppCoverageBaseline({ baseline, actualCoverage, actualInventory }) {
  const issues = [];
  for (const key of COVERAGE_KEYS) {
    if (actualCoverage[key] < baseline.coverage[key]) {
      issues.push({
        code: 'coverage-regression',
        metric: key,
        expectedMinimum: baseline.coverage[key],
        actual: actualCoverage[key],
      });
    }
  }
  if (actualInventory.testFiles !== baseline.testFiles) {
    issues.push({
      code: 'test-file-count-drift',
      expected: baseline.testFiles,
      actual: actualInventory.testFiles,
    });
  }
  if (actualInventory.tests !== baseline.tests) {
    issues.push({
      code: 'test-count-drift',
      expected: baseline.tests,
      actual: actualInventory.tests,
    });
  }
  return issues;
}

function readActualInventory(appRoot) {
  const vitest = path.join(appRoot, '..', '..', 'node_modules', '.bin', 'vitest');
  const result = spawnSync(vitest, ['list', '--json'], {
    cwd: appRoot,
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`Unable to list App tests: ${result.stderr || result.stdout}`);
  }
  const tests = JSON.parse(result.stdout);
  return {
    testFiles: new Set(tests.map((entry) => entry.file)).size,
    tests: tests.length,
  };
}

function verifyAppCoverageBaseline(repoRoot = path.resolve(__dirname, '..')) {
  const appRoot = path.join(repoRoot, 'packages', 'agenthub-app');
  const baseline = JSON.parse(fs.readFileSync(path.join(appRoot, 'coverage-baseline.json'), 'utf8'));
  const summary = JSON.parse(fs.readFileSync(
    path.join(appRoot, 'coverage', 'coverage-summary.json'),
    'utf8',
  ));
  const actualCoverage = Object.fromEntries(
    COVERAGE_KEYS.map((key) => [key, summary.total[key].pct]),
  );
  const actualInventory = readActualInventory(appRoot);
  return {
    baseline,
    actualCoverage,
    actualInventory,
    issues: checkAppCoverageBaseline({ baseline, actualCoverage, actualInventory }),
  };
}

if (require.main === module) {
  try {
    const result = verifyAppCoverageBaseline();
    process.stdout.write(`${JSON.stringify({ ok: result.issues.length === 0, ...result }, null, 2)}\n`);
    process.exitCode = result.issues.length === 0 ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  }
}

module.exports = { checkAppCoverageBaseline, verifyAppCoverageBaseline };
