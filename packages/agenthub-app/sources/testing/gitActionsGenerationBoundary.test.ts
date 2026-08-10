import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('git actions generation boundary', () => {
    it('guards manual git status refresh before applying storage results', () => {
        const source = fs.readFileSync(
            path.resolve(__dirname, '..', 'hooks/useGitActions.ts'),
            'utf8',
        );

        expect(source).toContain("import { sync } from '@/sync/sync';");
        expect(source).toContain('const generation = sync.getAccountGeneration();');
        expect(source).toContain('isCurrent: () => boolean =');
        expect(source).toContain('if (!isCurrent()) return;');
        expect(source).toContain('request: () => gitOps.discardFileChanges');
        expect(source).toContain('request: () => gitOps.discardAllChanges');
        expect(source).toContain('request: () => gitOps.stageFile');
        expect(source).toContain('request: () => gitOps.unstageFile');
        expect(source).toContain('request: () => gitOps.commitChanges');
        expect(source).toContain('request: () => gitOps.stashSave');
        expect(source).toContain('request: () => gitOps.stashPop');
        expect(source).toContain('request: () => gitOps.pushChanges');
        expect(source).toContain('request: () => gitOps.pullChanges');
        expect(source).toContain('if (confirmed !== true) return;');
    });
});
