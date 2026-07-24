const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { readFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const APP_ROOT = path.join(ROOT, 'packages', 'agenthub-app');

function summarize(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new TypeError('Expected at least one finite benchmark sample.');
  }
  const sorted = [...values].sort((left, right) => left - right);
  return {
    min: sorted[0],
    median: sorted[Math.floor(sorted.length / 2)],
    max: sorted[sorted.length - 1],
  };
}

function evaluateGates(messageRuns, inactiveRuns, requestedRuns) {
  const exactlyRequestedRuns = messageRuns.length === requestedRuns && inactiveRuns.length === requestedRuns;
  const allFixtureStable = messageRuns.every((run) => (
    run.historyMessages === 10_000
    && run.iterations === 200
  )) && inactiveRuns.every((run) => (
    run.inactiveSessions === 50
    && run.messagesPerSession === 10_000
    && run.maxRetainedInactive === 20
    && run.retainedSessions === 20
  ));
  const allP95ImprovementAtLeast75Percent = messageRuns.every((run) => run.p95ImprovementPercent >= 75);
  const allReclaimedAtLeast50Percent = inactiveRuns.every((run) => run.reclaimedPercent >= 50);
  return {
    exactlyRequestedRuns,
    allFixtureStable,
    allP95ImprovementAtLeast75Percent,
    allReclaimedAtLeast50Percent,
    passed: exactlyRequestedRuns
      && allFixtureStable
      && allP95ImprovementAtLeast75Percent
      && allReclaimedAtLeast50Percent,
  };
}

function runBenchmark(script) {
  return JSON.parse(execFileSync(process.execPath, [
    '--expose-gc',
    '--import',
    'tsx',
    script,
  ], {
    cwd: APP_ROOT,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  }));
}

function gitOutput(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();
}

function sha256(file) {
  return createHash('sha256').update(readFileSync(path.join(ROOT, file))).digest('hex');
}

function buildReport(requestedRuns = 5) {
  if (!Number.isInteger(requestedRuns) || requestedRuns < 3 || requestedRuns > 20) {
    throw new RangeError('--runs must be an integer from 3 through 20.');
  }

  const messageRuns = [];
  const inactiveRuns = [];
  for (let index = 0; index < requestedRuns; index += 1) {
    messageRuns.push(runBenchmark('sources/scripts/benchmarkSessionMessageIndex.ts'));
  }
  for (let index = 0; index < requestedRuns; index += 1) {
    inactiveRuns.push(runBenchmark('sources/scripts/benchmarkInactiveSessionRetention.ts'));
  }

  const gates = evaluateGates(messageRuns, inactiveRuns, requestedRuns);
  return {
    schemaVersion: 1,
    timestamp: new Date().toISOString(),
    source: {
      baseCommit: gitOutput(['rev-parse', 'HEAD']),
      dirtyEntries: gitOutput(['status', '--porcelain']).split('\n').filter(Boolean).length,
      fileSha256: Object.fromEntries([
        'packages/agenthub-app/sources/scripts/benchmarkSessionMessageIndex.ts',
        'packages/agenthub-app/sources/scripts/benchmarkInactiveSessionRetention.ts',
        'packages/agenthub-app/sources/sync/sessionMessageIndex.ts',
        'scripts/runAppPerformanceBaseline.cjs',
      ].map((file) => [file, sha256(file)])),
    },
    environment: {
      node: process.version,
      v8: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      kernel: os.release(),
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      cpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    fixture: {
      runs: requestedRuns,
      messageHistory: messageRuns[0].historyMessages,
      messageIterations: messageRuns[0].iterations,
      inactiveSessions: inactiveRuns[0].inactiveSessions,
      messagesPerSession: inactiveRuns[0].messagesPerSession,
      maxRetainedInactive: inactiveRuns[0].maxRetainedInactive,
    },
    metricSemantics: {
      latency: 'Per-operation wall-clock samples from node:perf_hooks on one fixed host.',
      retainedHeap: 'GC-stabilized heap delta; it is not a transient browser peak.',
      maxLoadedFixtureHeapDelta: 'Maximum GC-stabilized 50x10k loaded fixture heap delta across repeated child processes.',
    },
    messageIndexRuns: messageRuns,
    messageIndexSummary: {
      legacyP50Ms: summarize(messageRuns.map((run) => run.legacy.p50Ms)),
      legacyP95Ms: summarize(messageRuns.map((run) => run.legacy.p95Ms)),
      currentP50Ms: summarize(messageRuns.map((run) => run.current.p50Ms)),
      currentP95Ms: summarize(messageRuns.map((run) => run.current.p95Ms)),
      p95ImprovementPercent: summarize(messageRuns.map((run) => run.p95ImprovementPercent)),
      legacyRetainedHeapBytes: summarize(messageRuns.map((run) => run.legacy.retainedHeapBytes)),
      currentRetainedHeapBytes: summarize(messageRuns.map((run) => run.current.retainedHeapBytes)),
    },
    inactiveRuns,
    inactiveSummary: {
      loadedHeapBytes: summarize(inactiveRuns.map((run) => run.loadedHeapBytes)),
      retainedHeapBytes: summarize(inactiveRuns.map((run) => run.retainedHeapBytes)),
      reclaimedPercent: summarize(inactiveRuns.map((run) => run.reclaimedPercent)),
      selectionMs: summarize(inactiveRuns.map((run) => run.retentionDurationMs)),
      maxLoadedFixtureHeapDeltaBytes: Math.max(...inactiveRuns.map((run) => run.loadedHeapBytes)),
    },
    gates,
  };
}

function parseRuns(argv) {
  const argument = argv.find((value) => value.startsWith('--runs='));
  return argument ? Number(argument.slice('--runs='.length)) : 5;
}

if (require.main === module) {
  try {
    const report = buildReport(parseRuns(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    if (!report.gates.passed) process.exitCode = 1;
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  summarize,
  evaluateGates,
  buildReport,
};
