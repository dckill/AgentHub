export type FlakeRun = { index: number; seed: number; reportPath: string };

export function buildFlakeRuns(options: { runs: number; baseSeed: number }): FlakeRun[] {
    if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 20) {
        throw new Error('runs must be an integer between 1 and 20');
    }
    if (!Number.isSafeInteger(options.baseSeed) || options.baseSeed < 0) {
        throw new Error('baseSeed must be a non-negative safe integer');
    }
    return Array.from({ length: options.runs }, (_, offset) => {
        const index = offset + 1;
        const seed = options.baseSeed + offset;
        return {
            index,
            seed,
            reportPath: `reports/flake/run-${index}-seed-${seed}.xml`,
        };
    });
}

export function runFlakeSuite(
    runs: FlakeRun[],
    execute: (run: FlakeRun) => number,
): { exitCode: number; completedRuns: number; failedSeed?: number } {
    for (const run of runs) {
        const exitCode = execute(run);
        if (exitCode !== 0) {
            return { exitCode, completedRuns: run.index, failedSeed: run.seed };
        }
    }
    return { exitCode: 0, completedRuns: runs.length };
}
