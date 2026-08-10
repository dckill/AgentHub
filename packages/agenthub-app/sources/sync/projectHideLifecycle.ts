/** Run the async portion of project hiding without applying a stale account result. */
export async function runProjectHideLifecycle({
    hasActiveSessions,
    archiveActiveSessions,
    ignoreOfficialThreads,
    isCurrent,
    applyHiddenCustomization,
}: {
    hasActiveSessions: boolean;
    archiveActiveSessions: () => Promise<boolean | void>;
    ignoreOfficialThreads: () => Promise<void>;
    isCurrent: () => boolean;
    applyHiddenCustomization: () => void;
}): Promise<boolean> {
    if (!isCurrent()) {
        return false;
    }

    if (hasActiveSessions) {
        const archived = await archiveActiveSessions();
        if (archived === false) {
            return false;
        }
    }
    if (!isCurrent()) {
        return false;
    }

    await ignoreOfficialThreads();
    if (!isCurrent()) {
        return false;
    }

    applyHiddenCustomization();
    return true;
}
