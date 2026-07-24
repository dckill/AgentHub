import { describe, expect, it, vi } from 'vitest';
import { buildFlakeRuns, runFlakeSuite } from './flakeRunner';

describe('App flake runner', () => {
    it('builds bounded, reproducible shuffled runs with separate JUnit reports', () => {
        expect(buildFlakeRuns({ runs: 3, baseSeed: 4100 })).toEqual([
            { index: 1, seed: 4100, reportPath: 'reports/flake/run-1-seed-4100.xml' },
            { index: 2, seed: 4101, reportPath: 'reports/flake/run-2-seed-4101.xml' },
            { index: 3, seed: 4102, reportPath: 'reports/flake/run-3-seed-4102.xml' },
        ]);
        expect(() => buildFlakeRuns({ runs: 0, baseSeed: 1 })).toThrow('runs must be an integer between 1 and 20');
        expect(() => buildFlakeRuns({ runs: 21, baseSeed: 1 })).toThrow('runs must be an integer between 1 and 20');
    });

    it('fails on the first non-zero run without retrying or hiding it', () => {
        const execute = vi.fn()
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(1)
            .mockReturnValueOnce(0);

        const result = runFlakeSuite(buildFlakeRuns({ runs: 3, baseSeed: 7 }), execute);

        expect(result).toEqual({ exitCode: 1, completedRuns: 2, failedSeed: 8 });
        expect(execute).toHaveBeenCalledTimes(2);
    });
});
