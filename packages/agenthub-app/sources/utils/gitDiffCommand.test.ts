import { describe, expect, it } from 'vitest';

import {
    buildGitFileDiffExec,
    buildGitFileReadExec,
    buildGitWorktreeRemoveExec,
} from './gitDiffCommand';

describe('gitDiffCommand', () => {
    it('uses cached diff for staged files', () => {
        expect(buildGitFileDiffExec('src/app.ts', 'staged')).toEqual({ executable: 'git', args: ['diff', '--cached', '--no-ext-diff', '--', 'src/app.ts'] });
    });

    it('uses working tree diff for unstaged files', () => {
        expect(buildGitFileDiffExec("src/it's fine.ts", 'unstaged')).toEqual({ executable: 'git', args: ['diff', '--no-ext-diff', '--', "src/it's fine.ts"] });
    });

    it('uses HEAD diff when the source is unknown', () => {
        expect(buildGitFileDiffExec('src/app.ts', null)).toEqual({ executable: 'git', args: ['diff', 'HEAD', '--no-ext-diff', '--', 'src/app.ts'] });
    });

    it('treats command substitution as a literal file name when reading a file', () => {
        expect(buildGitFileReadExec('$(touch${IFS}PWNED)')).toEqual({ executable: 'cat', args: ['--', '$(touch${IFS}PWNED)'] });
    });

    it('treats quotes, newlines, and command substitution as literal diff path content', () => {
        const path = "src/it's\n$(touch${IFS}PWNED).ts";

        expect(buildGitFileDiffExec(path, 'unstaged')).toEqual({ executable: 'git', args: ['diff', '--no-ext-diff', '--', path] });
    });

    it('treats a malicious worktree path as one literal argument', () => {
        const path = '/repo/.dev/worktree/$(touch${IFS}PWNED)';
        expect(buildGitWorktreeRemoveExec(path)).toEqual({ executable: 'git', args: ['worktree', 'remove', '--force', '--', path] });
    });
});
