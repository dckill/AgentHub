import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('missing session refresh recovery', () => {
    it('schedules a backoff-backed sessions sync when the direct refresh fails', () => {
        const source = readFileSync(resolve(__dirname, 'sync.ts'), 'utf8');
        const branch = source.match(/private refreshMissingSession = \(sessionId: string\) => \{[\s\S]*?\n    \}/)?.[0] ?? '';

        expect(source).toContain("import { scheduleMissingSessionRefresh } from './missingSessionRefreshApplication';");
        expect(branch).toContain('scheduleMissingSessionRefresh({');
        expect(branch).toContain('onCurrentError: (error) => {');
        expect(branch).toMatch(/this\.sessionsSync\.invalidate\(\);/);
    });
});
