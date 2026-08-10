/** Keep the post-spawn worktree merge sequence scoped to its originating account. */
export async function runWorktreeMergePostSpawnLifecycle({
    isCurrent,
    refreshSessions,
    applyPermission,
    sendMergeMessage,
    confirmArchive,
    archiveOriginal,
    navigate,
}: {
    isCurrent: () => boolean;
    refreshSessions: () => Promise<void>;
    applyPermission: () => void;
    sendMergeMessage: () => Promise<void>;
    confirmArchive: () => Promise<boolean>;
    archiveOriginal: () => Promise<void>;
    navigate: () => void;
}): Promise<boolean> {
    if (!isCurrent()) {
        return false;
    }

    await refreshSessions();
    if (!isCurrent()) {
        return false;
    }

    applyPermission();
    if (!isCurrent()) {
        return false;
    }

    await sendMergeMessage();
    if (!isCurrent()) {
        return false;
    }

    const shouldArchive = await confirmArchive();
    if (!isCurrent()) {
        return false;
    }

    if (shouldArchive) {
        await archiveOriginal();
        if (!isCurrent()) {
            return false;
        }
    }

    navigate();
    return true;
}
