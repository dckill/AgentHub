import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const detailSource = fs.readFileSync(
    path.resolve(__dirname, '..', 'app/(app)/artifacts/[id].tsx'),
    'utf8',
);

describe('artifact detail account boundary', () => {
    it('does not delete or project an artifact after the account changes', () => {
        expect(detailSource).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(detailSource).toContain('const generation = sync.getAccountGeneration();');
        expect(detailSource).toContain('const isCurrent = () => generation !== null');
        expect(detailSource).toContain('if (!cancelled && isCurrent())');
        expect(detailSource).toContain('request: () => deleteArtifact');
    });
});
