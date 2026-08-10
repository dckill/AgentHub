import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const editSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/(app)/artifacts/edit/[id].tsx'),
    'utf8',
);

describe('artifact edit account boundary', () => {
    it('does not project a stale load or navigate after a stale save', () => {
        expect(editSource).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(editSource).toContain('const generation = sync.getAccountGeneration();');
        expect(editSource).toContain('const isCurrent = () => generation !== null');
        expect(editSource).toContain('if (!cancelled && isCurrent())');
        expect(editSource).toContain('request: () => sync.updateArtifact');
    });
});
