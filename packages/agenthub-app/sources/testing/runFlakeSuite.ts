import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { buildFlakeRuns, runFlakeSuite } from './flakeRunner';

const require = createRequire(import.meta.url);
const vitestPackage = require.resolve('vitest/package.json');
const vitestEntry = resolve(dirname(vitestPackage), 'vitest.mjs');
const runs = Number(process.env.AGENTHUB_FLAKE_RUNS ?? 3);
const baseSeed = Number(process.env.AGENTHUB_FLAKE_SEED ?? new Date().toISOString().slice(0, 10).replaceAll('-', ''));
const plan = buildFlakeRuns({ runs, baseSeed });

mkdirSync(resolve('reports/flake'), { recursive: true });

const result = runFlakeSuite(plan, (run) => {
    console.log(`[flake] run ${run.index}/${plan.length}, seed=${run.seed}`);
    const child = spawnSync(process.execPath, [
        vitestEntry,
        'run',
        '--sequence.shuffle',
        `--sequence.seed=${run.seed}`,
        '--reporter=default',
        '--reporter=junit',
        `--outputFile.junit=${run.reportPath}`,
    ], {
        cwd: process.cwd(),
        env: process.env,
        stdio: 'inherit',
    });
    return child.status ?? 1;
});

if (result.exitCode !== 0) {
    console.error(`[flake] failed after ${result.completedRuns} run(s), reproduce with AGENTHUB_FLAKE_SEED=${result.failedSeed} AGENTHUB_FLAKE_RUNS=1`);
}
process.exit(result.exitCode);
