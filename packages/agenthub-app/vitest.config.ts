import { defineConfig } from 'vitest/config'
import { resolve } from 'node:path'

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
                statements: 36.53,
                branches: 77.63,
                functions: 45.17,
                lines: 36.53,
            },
        },
    },
    resolve: {
        alias: {
            '@': resolve('./sources'),
        },
    },
})
