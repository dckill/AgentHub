import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('session snapshot decryption recovery', () => {
    it('refreshes the authoritative session snapshot when records cannot be decrypted', () => {
        const source = readFileSync(resolve(__dirname, 'sync.ts'), 'utf8');
        const lifecycle = readFileSync(resolve(__dirname, 'sessionSnapshotSyncLifecycle.ts'), 'utf8');

        expect(source).toContain("import { runSessionSnapshotSync } from './sessionSnapshotSyncLifecycle';");
        expect(source).toContain('runSessionSnapshotSync({');
        expect(source).toMatch(/scheduleRetry:\s*\(\) => this\.sessionsSync\.invalidate\(\)/);
        expect(lifecycle).toMatch(/applySessionSnapshotSync\(\{\s*snapshot:/);
        expect(lifecycle).toMatch(/appliedSnapshot\.reconciledSessions/);
    });
});
