import { describe, expect, it } from 'vitest';
import config from '../../vitest.config';
import packageJson from '../../package.json';

describe('App coverage policy', () => {
    const coverage = (config as any).test.coverage;

    it('measures product sources without counting tests, generated files, or dev-only QA', () => {
        expect(coverage.include).toEqual(['sources/**/*.{ts,tsx}']);
        expect(coverage.exclude).toEqual(expect.arrayContaining([
            'sources/**/*.{spec,test,appspec}.ts',
            'sources/**/*.d.ts',
            'sources/theme.gen.ts',
            'sources/dev/**',
            'sources/app/(app)/dev/**',
            'sources/testing/**',
        ]));
    });

    it('has an explicit non-decreasing global threshold and durable reports', () => {
        expect(coverage.reporter).toEqual(expect.arrayContaining(['text', 'json-summary', 'html', 'lcov']));
        expect(coverage.thresholds).toEqual({
            statements: 36.53,
            branches: 77.63,
            functions: 45.17,
            lines: 36.53,
        });
        expect(packageJson.scripts['test:coverage']).toBe('vitest run --coverage');
    });

    it('has a CI test command that persists a JUnit report', () => {
        expect(packageJson.scripts['test:ci']).toBe(
            'vitest run --coverage --reporter=default --reporter=junit --outputFile.junit=reports/junit.xml',
        );
        expect(packageJson.scripts['test:flake']).toBe('tsx sources/testing/runFlakeSuite.ts');
    });
});
