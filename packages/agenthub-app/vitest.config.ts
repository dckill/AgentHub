import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'
import coverageBaseline from './coverage-baseline.json'

export default defineConfig({
    test: {
        globals: false,
        environment: 'node',
        include: ['sources/**/*.{spec,test}.ts'],
        coverage: {
            provider: 'v8',
            include: ['sources/**/*.{ts,tsx}'],
            reporter: ['text', 'json-summary', 'html', 'lcov'],
            exclude: [
                'sources/**/*.{spec,test,appspec}.ts',
                'sources/**/*.d.ts',
                'sources/theme.gen.ts',
                'sources/dev/**',
                'sources/app/(app)/dev/**',
                'sources/testing/**',
            ],
            thresholds: {
                statements: coverageBaseline.coverage.statements,
                branches: coverageBaseline.coverage.branches,
                functions: coverageBaseline.coverage.functions,
                lines: coverageBaseline.coverage.lines,
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve('./sources'),
        },
    },
})
