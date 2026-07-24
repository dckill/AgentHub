import type { GitStatusFiles } from '@/sync/gitStatusFiles';

export type GitStatusLoadState =
    | { kind: 'ready'; data: GitStatusFiles }
    | { kind: 'not-repo' }
    | { kind: 'error' };

const NOT_REPOSITORY_PATTERN = /not a git repository/i;

export function classifyGitStatusLoadResult(result: GitStatusFiles | null): GitStatusLoadState {
    if (!result) {
        return { kind: 'not-repo' };
    }
    if (!result.debugError) {
        return { kind: 'ready', data: result };
    }
    if (NOT_REPOSITORY_PATTERN.test(result.debugError)) {
        return { kind: 'not-repo' };
    }
    return { kind: 'error' };
}
