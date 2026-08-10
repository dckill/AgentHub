type SessionKillOperation = (sessionId: string) => Promise<{ success: boolean }>;
type SessionArchiveOperation = (sessionId: string) => Promise<unknown>;

/** Close a side chat without allowing an account switch to cross the fallback boundary. */
export async function closeSideChatSession(
    id: string,
    isCurrent: () => boolean,
    kill: SessionKillOperation,
    archive: SessionArchiveOperation,
): Promise<boolean> {
    if (!isCurrent()) {
        return false;
    }

    const killed = await kill(id);
    if (!isCurrent()) {
        return false;
    }
    if (!killed.success) {
        await archive(id);
        return isCurrent();
    }
    return true;
}
