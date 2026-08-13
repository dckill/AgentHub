import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('artifact snapshot key recovery', () => {
    it('refreshes the authoritative artifact snapshot after a key decryption miss', () => {
        const source = readFileSync(resolve(__dirname, 'sync.ts'), 'utf8');
        const operations = readFileSync(resolve(__dirname, 'artifactOperations.ts'), 'utf8');
        const lifecycle = readFileSync(resolve(__dirname, 'artifactListSyncLifecycle.ts'), 'utf8');
        const method = operations.match(/fetchList: async[\s\S]*?fetchBody: async/)?.[0] ?? '';

        expect(method).toMatch(/runArtifactListSync/);
        expect(method).toMatch(/scheduleRetry: deps\.scheduleListRetry/);
        expect(source).toMatch(/scheduleListRetry: \(\) => this\.artifactsSync\.invalidate\(\)/);
        expect(lifecycle).toMatch(/applyArtifactListSync/);
        expect(lifecycle).toMatch(/scheduleRetry/);
    });
});
