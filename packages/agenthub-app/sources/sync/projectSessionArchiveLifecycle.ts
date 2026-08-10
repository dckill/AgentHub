/** Archive active project sessions only while the originating account remains current. */
export async function runProjectSessionArchiveLifecycle<T>({
    sessions,
    archiveSession,
    isCurrent,
    refreshSessions,
}: {
    sessions: readonly T[];
    archiveSession: (session: T, isCurrent: () => boolean) => Promise<boolean | void>;
    isCurrent: () => boolean;
    refreshSessions: () => Promise<void>;
}): Promise<boolean> {
    if (!isCurrent()) {
        return false;
    }

    for (const session of sessions) {
        if (!isCurrent()) {
            return false;
        }

        const result = await archiveSession(session, isCurrent);
        if (result === false || !isCurrent()) {
            return false;
        }
    }

    if (!isCurrent()) {
        return false;
    }

    await refreshSessions();
    return isCurrent();
}
