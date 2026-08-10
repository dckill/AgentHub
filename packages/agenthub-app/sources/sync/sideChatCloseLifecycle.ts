/** Close side chats only while the originating account remains current. */
export async function runSideChatCloseLifecycle({
    ids,
    closeSession,
    isCurrent,
    refreshSessions,
}: {
    ids: readonly string[];
    closeSession: (id: string, isCurrent: () => boolean) => Promise<boolean | void>;
    isCurrent: () => boolean;
    refreshSessions: () => Promise<void>;
}): Promise<boolean> {
    if (!isCurrent()) {
        return false;
    }

    for (const id of ids) {
        if (!isCurrent()) {
            return false;
        }

        const result = await closeSession(id, isCurrent);
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
