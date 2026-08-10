import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runArtifactListSync } from './artifactListSyncLifecycle';

const syncPath = path.resolve(__dirname, './sync.ts');
const lifecyclePath = path.resolve(__dirname, './artifactListSyncLifecycle.ts');
const syncSource = fs.readFileSync(syncPath, 'utf8');

describe('artifact list sync lifecycle boundary', () => {
    it('owns artifact list fetch orchestration outside Sync', () => {
        expect(fs.existsSync(lifecyclePath)).toBe(true);
        const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

        expect(lifecycleSource).toContain('export async function runArtifactListSync');
        expect(syncSource).toContain("import { runArtifactListSync } from './artifactListSyncLifecycle';");
        expect(syncSource).toContain('public fetchArtifactsList = async');
        expect(syncSource).toContain('runArtifactListSync({');
    });

    it('preserves retry and partial snapshot application callbacks', () => {
        const lifecycleSource = fs.readFileSync(lifecyclePath, 'utf8');

        expect(lifecycleSource).toContain('applyArtifactListSync');
        expect(lifecycleSource).toContain('scheduleRetry');
        expect(lifecycleSource).toContain('assertCurrent');
        expect(lifecycleSource).toContain('shouldReportSyncError');
    });
});
