import { describe, expect, it } from 'vitest';
import { classifyGitStatusLoadResult } from '@/hooks/gitStatusLoadState';

const readyResult = {
    stagedFiles: [],
    unstagedFiles: [],
    branch: 'master',
    totalStaged: 0,
    totalUnstaged: 0,
    debugError: null,
};

describe('classifyGitStatusLoadResult', () => {
    it('keeps a successful result ready for rendering', () => {
        expect(classifyGitStatusLoadResult(readyResult)).toEqual({
            kind: 'ready',
            data: readyResult,
        });
    });

    it('treats a missing result as a non-git workspace', () => {
        expect(classifyGitStatusLoadResult(null)).toEqual({ kind: 'not-repo' });
    });

    it('recognizes the git non-repository diagnostic without exposing it', () => {
        expect(classifyGitStatusLoadResult({
            ...readyResult,
            debugError: "fatal: not a git repository (or any parent up to mount point /srv/private)",
        })).toEqual({ kind: 'not-repo' });
    });

    it('classifies daemon and RPC failures as retryable without returning raw diagnostics', () => {
        const classified = classifyGitStatusLoadResult({
            ...readyResult,
            debugError: 'session=secret machine=private-id path=/home/user/project websocket unavailable',
        });

        expect(classified).toEqual({ kind: 'error' });
        expect(JSON.stringify(classified)).not.toContain('/home/user/project');
        expect(JSON.stringify(classified)).not.toContain('private-id');
    });
});
