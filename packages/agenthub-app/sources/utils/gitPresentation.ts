import type { TranslationKey } from '@/text';
import type { GitFileStatus } from '@/sync/gitStatusFiles';

export interface GitFileStatusPresentation {
    labelKey: TranslationKey;
    icon: string;
    tone: 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked';
}

export function getGitFileStatusPresentation(status: GitFileStatus['status']): GitFileStatusPresentation {
    switch (status) {
        case 'modified':
            return { labelKey: 'files.modified', icon: 'diff-modified', tone: 'modified' };
        case 'added':
            return { labelKey: 'files.added', icon: 'diff-added', tone: 'added' };
        case 'deleted':
            return { labelKey: 'files.deleted', icon: 'diff-removed', tone: 'deleted' };
        case 'renamed':
            return { labelKey: 'files.renamed', icon: 'arrow-right', tone: 'renamed' };
        case 'untracked':
            return { labelKey: 'files.untracked', icon: 'file', tone: 'untracked' };
    }
}

export interface GitToolbarState {
    hasStaged: boolean;
    isDirty: boolean;
    hasUnstaged: boolean;
    stashCount: number;
    aheadCount: number;
    hasUpstream: boolean;
}

export type GitToolbarActionId =
    | 'commit'
    | 'discard'
    | 'stash'
    | 'stash-pop'
    | 'push'
    | 'pull';

export interface GitToolbarActionDescriptor {
    id: GitToolbarActionId;
    icon: string;
    labelKey: TranslationKey;
    destructive?: boolean;
    muted?: boolean;
}

export function getGitToolbarActions(state: GitToolbarState): GitToolbarActionDescriptor[] {
    const actions: GitToolbarActionDescriptor[] = [];

    if (state.hasStaged) {
        actions.push({ id: 'commit', icon: 'git-commit', labelKey: 'gitActions.commit' });
    }
    if (state.isDirty) {
        actions.push({ id: 'discard', icon: 'trash', labelKey: 'gitActions.discard', destructive: true });
    }
    if (state.hasUnstaged) {
        actions.push({ id: 'stash', icon: 'archive', labelKey: 'gitActions.stash' });
    }
    if (state.stashCount > 0) {
        actions.push({ id: 'stash-pop', icon: 'inbox', labelKey: 'gitActions.stashPop', muted: true });
    }
    if (state.aheadCount > 0) {
        actions.push({ id: 'push', icon: 'arrow-up', labelKey: 'gitActions.push' });
    }
    if (state.hasUpstream) {
        actions.push({ id: 'pull', icon: 'arrow-down', labelKey: 'gitActions.pull' });
    }

    return actions;
}
