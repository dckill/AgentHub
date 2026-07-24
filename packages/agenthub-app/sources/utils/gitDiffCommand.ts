export type GitFileDiffSource = 'staged' | 'unstaged' | null | undefined;
export type StructuredCommand = { executable: string; args: string[] };

export function buildGitFileDiffExec(filePath: string, source: GitFileDiffSource): StructuredCommand {
    const args = source === 'staged'
        ? ['diff', '--cached', '--no-ext-diff', '--', filePath]
        : source === 'unstaged'
            ? ['diff', '--no-ext-diff', '--', filePath]
            : ['diff', 'HEAD', '--no-ext-diff', '--', filePath];
    return { executable: 'git', args };
}

export function buildGitFileReadExec(filePath: string): StructuredCommand {
    return { executable: 'cat', args: ['--', filePath] };
}

export function buildGitWorktreeRemoveExec(worktreePath: string): StructuredCommand {
    return { executable: 'git', args: ['worktree', 'remove', '--force', '--', worktreePath] };
}
