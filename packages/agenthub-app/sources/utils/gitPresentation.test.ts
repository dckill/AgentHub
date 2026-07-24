import { describe, expect, it } from 'vitest';

import {
    getGitFileStatusPresentation,
    getGitToolbarActions,
} from './gitPresentation';

describe('gitPresentation', () => {
    it('returns a readable status label for every git file status', () => {
        expect(getGitFileStatusPresentation('modified').labelKey).toBe('files.modified');
        expect(getGitFileStatusPresentation('added').labelKey).toBe('files.added');
        expect(getGitFileStatusPresentation('deleted').labelKey).toBe('files.deleted');
        expect(getGitFileStatusPresentation('renamed').labelKey).toBe('files.renamed');
        expect(getGitFileStatusPresentation('untracked').labelKey).toBe('files.untracked');
    });

    it('keeps bottom toolbar actions readable instead of icon-only', () => {
        expect(getGitToolbarActions({
            hasStaged: true,
            isDirty: true,
            hasUnstaged: true,
            stashCount: 1,
            aheadCount: 1,
            hasUpstream: true,
        }).map((action) => action.labelKey)).toEqual([
            'gitActions.commit',
            'gitActions.discard',
            'gitActions.stash',
            'gitActions.stashPop',
            'gitActions.push',
            'gitActions.pull',
        ]);
    });
});
