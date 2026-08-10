import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const source = readFileSync(join(__dirname, '..', 'app/(app)/new/index.tsx'), 'utf8');

describe('New session worktree account lifecycle boundary', () => {
    it('fails closed when the worktree list resolves for a stale account', () => {
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('request: () => listWorktrees(selectedMachineId, debouncedResolvedSelectedPath)');
        expect(source).toContain('if (result === null || !isCurrent()) return;');
        expect(source).toContain('if (!isCurrent()) return;');
    });
});
