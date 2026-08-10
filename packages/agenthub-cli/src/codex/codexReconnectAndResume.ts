export type ReconnectAndResumeCodexThreadParams = {
    threadId: string | null;
    clearRecoveredTurns: () => void;
    disconnect: (preserveThreadState: boolean) => Promise<void>;
    connect: () => Promise<void>;
    resume: (threadId: string) => Promise<void>;
    reconcile: (threadId: string) => Promise<void>;
    clearThreadState: () => void;
    onResumeFailure: (error: unknown) => void;
};

/** Reconnect the app-server and reconcile a thread that survived the restart. */
export async function reconnectAndResumeCodexThread(
    params: ReconnectAndResumeCodexThreadParams,
): Promise<boolean> {
    const threadId = params.threadId;
    params.clearRecoveredTurns();
    await params.disconnect(Boolean(threadId));
    await params.connect();

    if (!threadId) {
        return false;
    }

    try {
        await params.resume(threadId);
        await params.reconcile(threadId);
        return true;
    } catch (error) {
        params.onResumeFailure(error);
        params.clearThreadState();
        return false;
    }
}
