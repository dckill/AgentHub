import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'hooks/useWorktreeMerge.ts'), 'utf8');

describe('Worktree merge account generation boundary', () => {
    it('captures the account before confirmation and gates the entire merge lifecycle', () => {
        const generationIndex = source.indexOf('const generation = sync.getAccountGeneration();');
        const confirmationIndex = source.indexOf('const confirmed =');

        expect(source).toContain("import { runSessionActionRequest } from '@/sync/sessionActionRequestLifecycle';");
        expect(source).toContain('runSessionActionRequest({');
        expect(generationIndex).toBeGreaterThan(-1);
        expect(confirmationIndex).toBeGreaterThan(-1);
        expect(generationIndex).toBeLessThan(confirmationIndex);
    });
});
