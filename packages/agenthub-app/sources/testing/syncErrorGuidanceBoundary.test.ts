import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const syncSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'sync', 'sync.ts'),
    'utf8',
);
const artifactOperationsSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'sync', 'artifactOperations.ts'),
    'utf8',
);
const actionableSyncSource = `${syncSource}\n${artifactOperationsSource}`;

describe('sync error guidance boundary', () => {
    it('keeps user-visible sync failures actionable', () => {
        expect(syncSource).not.toContain("throw new Error('Sync encryption is not initialized')");
        expect(syncSource).not.toContain("throw new Error('Sync account is not active')");
        expect(actionableSyncSource).not.toContain("throw new Error('Not authenticated')");
        expect(actionableSyncSource).not.toContain("throw new Error('Artifact not found')");

        expect(actionableSyncSource).toContain('Please sign in again and retry.');
        expect(actionableSyncSource).toContain('Refresh the list and retry.');
    });
});
